// ============================================================
//  IFSA SERVER — PHASE A (IFSA IMPLEMENTATION PLAN)
//  Additions over the previous hardened build:
//    1. Dual admin login (Feature 6) — login bug fixed
//    2. Google Reviews proxy + cache (Feature 1)
//    3. Achievements CRUD (Feature 2)
//    4. Grading Syllabus PDF upload/delete (Feature 3)
//    5. UPI Payment routes (Feature 5)
//    6. WhatsApp notify helper + WA config/contacts/broadcast (Features 4 & 7)
//    7. Gallery blur placeholder generation on upload (Feature 8)
//    8. Dynamic sitemap.xml route (Feature 9)
//  All original routes and logic are 100% preserved.
// ============================================================

const express       = require('express');
const multer        = require('multer');
const cors          = require('cors');
const fs            = require('fs');
const path          = require('path');
const bcrypt        = require('bcrypt');
const jwt           = require('jsonwebtoken');
const rateLimit     = require('express-rate-limit');
const ExcelJS       = require('exceljs');
const https         = require('https');
require('dotenv').config();
const sharp         = require('sharp');

const { verifyStudentToken, STUDENT_JWT_SECRET } = require('./auth-middleware');

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// MIGRATION: restrict CORS to the deployed frontend origin instead of
// allowing all origins now that frontend/backend are on separate hosts.
// Set FRONTEND_URL=https://ifsaacademy.in in .env (see Section 5 of migration plan).
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());


// ============================================================
//  SECURITY CONFIG
// ============================================================
const JWT_SECRET   = process.env.JWT_SECRET || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_IN_PRODUCTION';
const TOKEN_EXPIRY = '8h';

// ── Dual admin accounts (Feature 6) ──────────────────────────
// Admin 1 falls back to the legacy ADMIN_PASSWORD_HASH env var for backwards compat.
// Admin 2 is optional — only active when ADMIN2_PASSWORD_HASH is set.
// To generate a hash: node -e "require('bcrypt').hash('YOUR_PASSWORD',12).then(console.log)"
const DEFAULT_ADMIN_HASH =
    '$2b$12$ZmQLZDZkwGQqv4vke4kHg.hSF2GyZp8mzoa5lx2Z3R6XQ/8.g6YN6'; // "admin123" — CHANGE BEFORE DEPLOY

// Plan 2 Fix 2: Load named admins from admin-config.json if present; fall back to env vars.
// admin-config.json format: { "admins": [{ "passwordHash": "...", "name": "...", "role": "..." }] }
function loadAdminAccounts() {
    try {
        const cfgPath = path.join(__dirname, 'data', 'admin-config.json');
        if (fs.existsSync(cfgPath)) {
            const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (Array.isArray(config.admins) && config.admins.length > 0) {
                return config.admins
                    .filter(a => a.passwordHash)
                    .map((a, i) => ({
                        username: a.name || `admin${i + 1}`,
                        name:     a.name || `Admin ${i + 1}`,
                        role:     a.role || 'Admin',
                        hash:     a.passwordHash
                    }));
            }
        }
    } catch (e) {
        console.warn('[admin-config] Failed to load admin-config.json, falling back to env vars:', e.message);
    }
    // Fallback: env-var-based dual admin accounts (original behaviour)
    return [
        {
            username: process.env.ADMIN1_USERNAME || 'admin1',
            name:     process.env.ADMIN1_NAME     || process.env.ADMIN1_USERNAME || 'Admin',
            role:     'Admin',
            hash:     process.env.ADMIN1_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_HASH
        },
        {
            username: process.env.ADMIN2_USERNAME || 'admin2',
            name:     process.env.ADMIN2_NAME     || process.env.ADMIN2_USERNAME || 'Admin',
            role:     'Staff',
            hash:     process.env.ADMIN2_PASSWORD_HASH || ''
        }
    ].filter(a => a.hash);
}

const ADMIN_ACCOUNTS = loadAdminAccounts();


// ============================================================
//  RATE LIMITER — 5 login attempts per 15 min per IP
// ============================================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
});


// ============================================================
//  JWT MIDDLEWARE
// ============================================================
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
}


// ============================================================
//  ACTIVITY LOG HELPER
// ============================================================
function writeLog(req, action, item) {
    try {
        const log = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
        log.unshift({
            timestamp: new Date().toISOString(),
            action,
            item:  String(item || '').slice(0, 120),
            who:   req.user && (req.user.name || req.user.username) ? (req.user.name || req.user.username) : 'unknown',
            admin: req.user && req.user.username ? req.user.username : 'unknown',
            ip:    req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
        });
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(log.slice(0, 200), null, 2));
    } catch (e) {
        console.error('[activity log] write error:', e.message);
    }
}


// ============================================================
//  FILE TYPE VALIDATION
// ============================================================
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif', 'image/tiff', 'image/bmp',
];
const ALLOWED_VIDEO_TYPES = [
    'video/mp4', 'video/webm', 'video/x-matroska', 'video/mkv',
    'video/quicktime', 'video/x-msvideo', 'video/avi',
];
const ALLOWED_DOC_TYPES = ['application/pdf'];

const fileFilter = (req, file, cb) => {
    const url = req.originalUrl;
    if (url.includes('documents') || url.includes('syllabus')) {
        if (ALLOWED_DOC_TYPES.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only PDF files are allowed.'), false);
    }
    if (url.includes('gallery')) {
        if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only images and videos are allowed for gallery.'), false);
    }
    if (url.includes('payment')) {
        if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES].includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only images or PDFs allowed for payment screenshots.'), false);
    }
    if (url.includes('achievements')) {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only image files are allowed for achievement images.'), false);
    }
    if ([...ALLOWED_IMAGE_TYPES].includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type. Only images are allowed (JPG, PNG, WebP, HEIC).'), false);
};


// ── PATH SETUP ───────────────────────────────────────────────
const ROOT_UPLOAD_PATH      = path.join(__dirname, 'uploads');
const SLIDESHOW_PATH        = path.join(ROOT_UPLOAD_PATH, 'slideshow');
const GALLERY_PATH          = path.join(ROOT_UPLOAD_PATH, 'gallery');
const DOCUMENT_PATH         = path.join(ROOT_UPLOAD_PATH, 'document');
const HERO_VIDEO_PATH       = path.join(ROOT_UPLOAD_PATH, 'hero-video');
const SYLLABUS_PATH         = path.join(ROOT_UPLOAD_PATH, 'syllabus');       // Feature 3
const PAYMENTS_UPLOAD_PATH  = path.join(ROOT_UPLOAD_PATH, 'payments');       // Feature 5
const DATA_PATH             = path.join(__dirname, 'data');

// Data files — existing
// MIGRATION: these were root-relative (__dirname); moved to DATA_PATH
// so they resolve to backend/data/ after the frontend/backend split.
const BOOKING_FILE          = path.join(DATA_PATH, 'bookings.xlsx');
const GALLERY_DB            = path.join(DATA_PATH, 'gallery-data.json');
const DOC_DB                = path.join(DATA_PATH, 'document-data.json');
const SCHEDULE_DB           = path.join(DATA_PATH, 'schedule-data.json');
const ANNOUNCE_DB           = path.join(DATA_PATH, 'announcement-data.json');
const LOCATIONS_FILE        = path.join(DATA_PATH, 'locations.json');
const INSTRUCTORS_FILE      = path.join(DATA_PATH, 'instructors.json');
const TESTIMONIALS_FILE     = path.join(DATA_PATH, 'testimonials.json');
const TIMETABLE_FILE        = path.join(DATA_PATH, 'timetable.json');
const HERO_VIDEO_FILE       = path.join(DATA_PATH, 'hero-video.json');
const SITE_DATA_FILE        = path.join(DATA_PATH, 'site-data.json');
const SLIDESHOW_ORDER_FILE  = path.join(DATA_PATH, 'slideshow-order.json');
const ACTIVITY_LOG_FILE     = path.join(DATA_PATH, 'admin-log.json');

// Data files — new (Phase A)
const ACHIEVEMENTS_FILE     = path.join(DATA_PATH, 'achievements.json');       // Feature 2
const SYLLABUS_FILE         = path.join(DATA_PATH, 'syllabus.json');           // Feature 3
const GOOGLE_REVIEWS_FILE   = path.join(DATA_PATH, 'google-reviews.json');    // Feature 1
const PAYMENTS_FILE         = path.join(DATA_PATH, 'payments.json');           // Feature 5
const PAYMENT_SETTINGS_FILE = path.join(DATA_PATH, 'payment-settings.json'); // Feature 5
const WA_CONFIG_FILE        = path.join(DATA_PATH, 'wa-config.json');         // Feature 4
const WA_CONTACTS_FILE      = path.join(DATA_PATH, 'wa-contacts.json');       // Feature 7

// Phase 1 additions
const STATS_FILE            = path.join(DATA_PATH, 'stats.json');             // Fix 5
const ACHIEVEMENTS_UPLOAD_PATH = path.join(ROOT_UPLOAD_PATH, 'achievements'); // Fix 1

// Plan 2 — Phase A additions
const TIMETABLE_SLOTS_FILE  = path.join(DATA_PATH, 'timetable-slots.json');   // Fix 1
const ADMIN_CONFIG_FILE     = path.join(__dirname, 'data', 'admin-config.json'); // Fix 2

// Ensure all upload folders exist
[
    ROOT_UPLOAD_PATH, SLIDESHOW_PATH, GALLERY_PATH, DOCUMENT_PATH,
    DATA_PATH, HERO_VIDEO_PATH, SYLLABUS_PATH, PAYMENTS_UPLOAD_PATH,
    ACHIEVEMENTS_UPLOAD_PATH
].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// Ensure all data files exist with sensible defaults
const DATA_FILE_DEFAULTS = {
    [GALLERY_DB]:            [],
    [DOC_DB]:                [],
    [SCHEDULE_DB]:           [],
    [ANNOUNCE_DB]:           [],
    [LOCATIONS_FILE]:        [],
    [INSTRUCTORS_FILE]:      [],
    [TESTIMONIALS_FILE]:     [],
    [TIMETABLE_FILE]:        [],
    [HERO_VIDEO_FILE]:       {},
    [SITE_DATA_FILE]:        { heroVideos: {}, programImages: {} },
    [SLIDESHOW_ORDER_FILE]:  [],
    [ACTIVITY_LOG_FILE]:     [],
    // Phase A additions
    [ACHIEVEMENTS_FILE]:     [],
    [SYLLABUS_FILE]:         {},
    [GOOGLE_REVIEWS_FILE]:   {
        rating: 0, totalRatings: 0, placeId: '',
        reviews: [], lastFetched: null, manualOverride: false
    },
    [PAYMENTS_FILE]:         [],
    [PAYMENT_SETTINGS_FILE]: { upiId: '', paymentTypes: ['Monthly Fees', 'Admission Fee', 'Event Fee'] },
    [WA_CONFIG_FILE]:        {},
    [WA_CONTACTS_FILE]:      [],
    // Phase 1 additions
    [STATS_FILE]:            {
        years:      { value: 15,  suffix: '+', label: 'Years'       },
        students:   { value: 500, suffix: '+', label: 'Students'    },
        blackBelts: { value: 50,  suffix: '+', label: 'Black Belts' },
        locations:  { value: 3,   suffix: '',  label: 'Locations'   }
    },
    // Plan 2 — Phase A additions
    [TIMETABLE_SLOTS_FILE]:  ['Morning (6–8 AM)', 'Evening (5–7 PM)'],
};
Object.entries(DATA_FILE_DEFAULTS).forEach(([file, def]) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
});

// Phase 3 — Students file
const STUDENTS_FILE = path.join(DATA_PATH, 'students.json');
if (!fs.existsSync(STUDENTS_FILE)) {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify([], null, 2));
}

// Static file serving for uploads
app.use('/uploads', express.static(ROOT_UPLOAD_PATH));


// ── MULTER STORAGE ───────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (req.originalUrl.includes('slideshow'))       cb(null, SLIDESHOW_PATH);
        else if (req.originalUrl.includes('gallery'))    cb(null, GALLERY_PATH);
        else if (req.originalUrl.includes('documents'))  cb(null, DOCUMENT_PATH);
        else if (req.originalUrl.includes('syllabus'))   cb(null, SYLLABUS_PATH);
        else if (req.originalUrl.includes('payment'))    cb(null, PAYMENTS_UPLOAD_PATH);
        else if (req.originalUrl.includes('achievements')) cb(null, ACHIEVEMENTS_UPLOAD_PATH);
        else cb(null, ROOT_UPLOAD_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 }
});

// Global multer error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || (err.message && err.message.includes('allowed'))) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});


// ============================================================
//  IMAGE COMPRESSION HELPER
// ============================================================
const COMPRESSIBLE_IMAGE_EXTS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.heic', '.heif', '.tiff', '.tif', '.bmp',
];

async function compressImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!COMPRESSIBLE_IMAGE_EXTS.includes(ext)) return;
    const tempPath  = filePath + '.tmp.webp';
    const finalPath = filePath.replace(/\.[^.]+$/, '.webp');
    try {
        await sharp(filePath)
            .resize({ width: 4000, withoutEnlargement: true })
            .webp({ quality: 90 })
            .toFile(tempPath);
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, finalPath);
    } catch (err) {
        console.error('Image compression failed:', err.message);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
}


// ============================================================
//  WHATSAPP NOTIFY HELPER  (Feature 4 + 7)
//  Reads gateway config from data/wa-config.json.
//
//  Supports two modes based on config.provider:
//
//  'meta' — Meta Cloud API (FREE, no third-party fees)
//    gatewayUrl : https://graph.facebook.com/v19.0/PHONE_NUMBER_ID/messages
//    apiToken   : System User permanent access token from Meta Business Manager
//    Broadcasts use free-form text messages (no pre-approved template needed).
//    Booking confirmations still use templates (template must exist in Meta).
//
//  'custom' / 'wati' / 'interakt' etc. — legacy template mode (unchanged).
//
//  Fails silently — never crashes a booking or announcement route.
// ============================================================
async function whatsappNotify(phone, templateName, params = {}) {
    try {
        const config = JSON.parse(fs.readFileSync(WA_CONFIG_FILE, 'utf8'));
        if (!config || !config.gatewayUrl || !config.apiToken || !phone) return;

        // Normalise phone: strip non-digits, ensure country code
        const normPhone = String(phone).replace(/\D/g, '');
        if (normPhone.length < 10) return;

        const isMeta = (config.provider || 'custom').toLowerCase() === 'meta';

        let payload;

        if (isMeta && params._freeText) {
            // ── Meta free-form text message (broadcasts / announcements) ──
            // No template approval needed. Uses 'text' message type.
            payload = JSON.stringify({
                messaging_product: 'whatsapp',
                to:   normPhone,
                type: 'text',
                text: { body: String(params._freeText) }
            });
        } else {
            // ── Template message (booking confirmations, all non-Meta providers) ──
            payload = JSON.stringify({
                messaging_product: 'whatsapp',
                to:   normPhone,
                type: 'template',
                template: {
                    name:     templateName,
                    language: { code: 'en' },
                    components: [{
                        type:       'body',
                        parameters: Object.entries(params)
                            .filter(([k]) => k !== '_freeText')
                            .map(([, v]) => ({ type: 'text', text: String(v) }))
                    }]
                }
            });
        }

        const url = new URL(config.gatewayUrl);
        const options = {
            hostname: url.hostname,
            port:     url.port || 443,
            path:     url.pathname + url.search,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Authorization':  `Bearer ${config.apiToken}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        await new Promise((resolve) => {
            const reqHttp = https.request(options, (r) => {
                let body = '';
                r.on('data', d => { body += d; });
                r.on('end', () => {
                    if (r.statusCode >= 300) {
                        console.error(`[whatsappNotify] Meta API ${r.statusCode}:`, body.slice(0, 200));
                    }
                    resolve();
                });
            });
            reqHttp.on('error', (e) => {
                console.error('[whatsappNotify] request error:', e.message);
                resolve();
            });
            reqHttp.write(payload);
            reqHttp.end();
        });
    } catch (e) {
        console.error('[whatsappNotify] error:', e.message);
        // Never crash the parent route
    }
}


// ============================================================
//  AUTH ROUTES
// ============================================================

// POST /api/admin/login
// Feature 6: checks both ADMIN1 and ADMIN2 hashes.
// JWT now includes { username } so logs tag which admin acted.
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required.' });

    try {
        let matchedAccount = null;
        for (const account of ADMIN_ACCOUNTS) {
            const match = await bcrypt.compare(password, account.hash);
            if (match) { matchedAccount = account; break; }
        }

        if (!matchedAccount) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        const token = jwt.sign(
            { role: 'admin', username: matchedAccount.username, name: matchedAccount.name },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );
        res.json({ token, expiresIn: TOKEN_EXPIRY, username: matchedAccount.username, name: matchedAccount.name });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// POST /api/admin/verify — frontend token check
app.post('/api/admin/verify', verifyToken, (req, res) => {
    res.json({ valid: true, username: req.user.username, name: req.user.name || req.user.username });
});

// GET /api/admin/config — return named admin list (hashes omitted for security)
app.get('/api/admin/config', verifyToken, (req, res) => {
    const cfgPath = path.join(__dirname, 'data', 'admin-config.json');
    try {
        if (fs.existsSync(cfgPath)) {
            const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            const safe   = (config.admins || []).map(a => ({ name: a.name, role: a.role }));
            return res.json({ source: 'admin-config.json', admins: safe });
        }
    } catch (e) { /* fall through */ }
    // Config file not present → report env-var based accounts (no hashes)
    res.json({
        source: 'env',
        admins: ADMIN_ACCOUNTS.map(a => ({ name: a.name, role: a.role }))
    });
});


// ============================================================
//  EXISTING ROUTES  (all preserved, some lightly modified)
// ============================================================

// ── 1. SLIDESHOW ─────────────────────────────────────────────
app.get('/api/slideshow/images', (req, res) => {
    fs.readdir(SLIDESHOW_PATH, (err, files) => {
        if (err) return res.send([]);
        const valid = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        try {
            const order = JSON.parse(fs.readFileSync(SLIDESHOW_ORDER_FILE, 'utf8'));
            if (Array.isArray(order) && order.length) {
                const orderMap = {};
                order.forEach((name, idx) => { orderMap[name] = idx; });
                valid.sort((a, b) => {
                    const ia = orderMap[a] !== undefined ? orderMap[a] : 9999;
                    const ib = orderMap[b] !== undefined ? orderMap[b] : 9999;
                    return ia - ib;
                });
            } else { valid.reverse(); }
        } catch (_) { valid.reverse(); }
        res.send(valid.map(f => `/uploads/slideshow/${f}`));
    });
});

app.post('/api/slideshow/upload', verifyToken, upload.array('images'), async (req, res) => {
    await Promise.all(req.files.map(f => compressImage(f.path)));
    writeLog(req, 'UPLOAD_SLIDESHOW', req.files.map(f => f.originalname).join(', '));
    res.send({ msg: 'OK' });
});

app.delete('/api/slideshow/images/:name', verifyToken, (req, res) => {
    const safeName = path.basename(req.params.name);
    fs.unlink(path.join(SLIDESHOW_PATH, safeName), () => res.send({ msg: 'Deleted' }));
    writeLog(req, 'DELETE_SLIDESHOW', safeName);
});

app.patch('/api/slideshow/reorder', verifyToken, (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    const safeOrder = order.map(name => path.basename(String(name)));
    fs.writeFileSync(SLIDESHOW_ORDER_FILE, JSON.stringify(safeOrder, null, 2));
    writeLog(req, 'REORDER_SLIDESHOW', `${safeOrder.length} slides`);
    res.json({ message: 'Order saved.' });
});


// ── Phase 4.3 — HERO VIDEO ───────────────────────────────────
app.get('/api/hero-video', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(HERO_VIDEO_FILE, 'utf8'));
        if (data && data.filename) res.json({ url: `/uploads/hero-video/${data.filename}` });
        else res.json({});
    } catch (e) { res.json({}); }
});

app.post('/api/hero-video/upload', verifyToken, (req, res) => {
    const heroUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, HERO_VIDEO_PATH),
            filename:    (req, file, cb) => cb(null, 'hero' + path.extname(file.originalname).toLowerCase()),
        }),
        fileFilter: (req, file, cb) => {
            const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/mkv'];
            if (allowed.includes(file.mimetype)) cb(null, true);
            else cb(new Error('Only MP4, WebM, MOV, and MKV videos allowed for hero background.'));
        },
        limits: { fileSize: 500 * 1024 * 1024 },
    }).single('video');
    heroUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
        const record = { filename: req.file.filename, uploadedAt: new Date().toISOString() };
        fs.writeFileSync(HERO_VIDEO_FILE, JSON.stringify(record));
        res.json({ message: 'Hero video uploaded.', url: `/uploads/hero-video/${req.file.filename}` });
    });
});

app.delete('/api/hero-video', verifyToken, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(HERO_VIDEO_FILE, 'utf8'));
        if (data && data.filename) {
            const filePath = path.join(HERO_VIDEO_PATH, path.basename(data.filename));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        fs.writeFileSync(HERO_VIDEO_FILE, JSON.stringify({}));
        res.json({ message: 'Hero video removed.' });
    } catch (e) { res.status(500).json({ error: 'Failed to remove hero video.' }); }
});


// ── 2. GALLERY ───────────────────────────────────────────────
app.get('/api/gallery/images', (req, res) => {
    const db = JSON.parse(fs.readFileSync(GALLERY_DB));
    res.send(db.map(e => ({ ...e, url: `/uploads/gallery/${e.filename}` })));
});

// Feature 8: Generate blur placeholder after compression
app.post('/api/gallery/upload', verifyToken, upload.array('images'), async (req, res) => {
    const { month, year, altText } = req.body;
    await Promise.all(req.files.map(f => compressImage(f.path)));

    const newEntries = await Promise.all(req.files.map(async (f) => {
        // After compressImage(), the file is now .webp
        const webpFilename = f.filename.replace(/\.[^.]+$/, '.webp');
        const webpPath     = path.join(GALLERY_PATH, webpFilename);
        let blurDataUrl    = '';
        try {
            // 20px wide blurred thumbnail → base64 (Feature 8)
            const tinyBuf = await sharp(webpPath).resize(20).blur(5).toBuffer();
            blurDataUrl   = 'data:image/webp;base64,' + tinyBuf.toString('base64');
        } catch (e) {
            console.error('[blur placeholder] failed:', e.message);
        }
        return {
            filename:    webpFilename,
            month,
            year,
            alt:         altText || '',
            blurDataUrl                   // Feature 8 — empty string for old records = safe
        };
    }));

    const db = JSON.parse(fs.readFileSync(GALLERY_DB));
    fs.writeFileSync(GALLERY_DB, JSON.stringify([...newEntries, ...db], null, 2));
    writeLog(req, 'UPLOAD_GALLERY', `${req.files.length} file(s) — ${month} ${year}`);
    res.send({ msg: 'OK' });
});

app.delete('/api/gallery/images/:name', verifyToken, (req, res) => {
    const safeName = path.basename(req.params.name);
    fs.unlink(path.join(GALLERY_PATH, safeName), () => {});
    const db = JSON.parse(fs.readFileSync(GALLERY_DB)).filter(e => e.filename !== safeName);
    fs.writeFileSync(GALLERY_DB, JSON.stringify(db, null, 2));
    writeLog(req, 'DELETE_GALLERY', safeName);
    res.send({ msg: 'Deleted' });
});


// ── 3. DOCUMENTS ─────────────────────────────────────────────
app.get('/api/documents/list', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DOC_DB));
    res.send(db.map(e => ({ ...e, url: `/uploads/document/${e.filename}` })));
});

app.post('/api/documents/upload', verifyToken, upload.single('file'), (req, res) => {
    const { title } = req.body;
    const newDoc = {
        filename: req.file.filename,
        title:    title || req.file.originalname,
        date:     new Date().toLocaleDateString()
    };
    const db = JSON.parse(fs.readFileSync(DOC_DB));
    fs.writeFileSync(DOC_DB, JSON.stringify([newDoc, ...db], null, 2));
    writeLog(req, 'UPLOAD_DOCUMENT', newDoc.title);
    res.send({ msg: 'Uploaded' });
});

app.delete('/api/documents/:name', verifyToken, (req, res) => {
    const safeName = path.basename(req.params.name);
    fs.unlink(path.join(DOCUMENT_PATH, safeName), () => {});
    const db = JSON.parse(fs.readFileSync(DOC_DB)).filter(e => e.filename !== safeName);
    fs.writeFileSync(DOC_DB, JSON.stringify(db, null, 2));
    writeLog(req, 'DELETE_DOCUMENT', safeName);
    res.send({ msg: 'Deleted' });
});


// ── 4. LOCATIONS ─────────────────────────────────────────────
app.get('/api/locations', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(LOCATIONS_FILE)));
});

app.post('/api/locations', verifyToken, (req, res) => {
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE));
    locations.push(req.body);
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    res.json({ message: 'Saved' });
});

app.delete('/api/locations/:id', verifyToken, (req, res) => {
    let locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE));
    locations = locations.filter(loc => loc.id !== req.params.id);
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    res.json({ message: 'Deleted' });
});


// ── 5. INSTRUCTORS ───────────────────────────────────────────
app.get('/api/instructors', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(INSTRUCTORS_FILE)));
});

app.post('/api/instructors', verifyToken, upload.fields([{ name: 'frontImage' }, { name: 'backImage' }]), (req, res) => {
    const instructors = JSON.parse(fs.readFileSync(INSTRUCTORS_FILE));
    const frontPath = req.files['frontImage'] ? '/uploads/' + req.files['frontImage'][0].filename : '';
    const backPath  = req.files['backImage']  ? '/uploads/' + req.files['backImage'][0].filename  : '';
    instructors.push({
        id:          Date.now().toString(),
        name:        req.body.name,
        role:        req.body.role,
        rank:        req.body.rank,
        description: req.body.description,
        frontImage:  frontPath,
        backImage:   backPath
    });
    fs.writeFileSync(INSTRUCTORS_FILE, JSON.stringify(instructors, null, 2));
    res.json({ message: 'Added' });
});

app.delete('/api/instructors/:id', verifyToken, (req, res) => {
    let instructors = JSON.parse(fs.readFileSync(INSTRUCTORS_FILE));
    instructors = instructors.filter(i => i.id !== req.params.id);
    fs.writeFileSync(INSTRUCTORS_FILE, JSON.stringify(instructors, null, 2));
    res.json({ message: 'Deleted' });
});


// ── 6. SCHEDULE ──────────────────────────────────────────────
app.get('/api/schedule/list', (req, res) => {
    res.send(JSON.parse(fs.readFileSync(SCHEDULE_DB)));
});

app.post('/api/schedule/add', verifyToken, (req, res) => {
    const { title, date, type } = req.body;
    const db = JSON.parse(fs.readFileSync(SCHEDULE_DB));
    const updatedDb = [...db, { id: Date.now(), title, date, type }]
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(SCHEDULE_DB, JSON.stringify(updatedDb, null, 2));
    res.send({ msg: 'Added' });
});

app.delete('/api/schedule/:id', verifyToken, (req, res) => {
    const id = parseInt(req.params.id);
    const db = JSON.parse(fs.readFileSync(SCHEDULE_DB));
    fs.writeFileSync(SCHEDULE_DB, JSON.stringify(db.filter(e => e.id !== id), null, 2));
    res.send({ msg: 'Deleted' });
});


// ── 7. ANNOUNCEMENTS ─────────────────────────────────────────
app.get('/api/announcement/list', (req, res) => {
    const now  = new Date();
    const all  = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const live = all.filter(a => !a.expires_on || new Date(a.expires_on) >= now);
    res.send(live);
});

// Feature 7: Optional broadcastWA flag sends to all active WA contacts
app.post('/api/announcement/add', verifyToken, async (req, res) => {
    const { message, expires_on, broadcastWA } = req.body;
    const db    = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const entry = {
        id:         Date.now(),
        message,
        date:       new Date().toLocaleDateString(),
        expires_on: expires_on || null
    };
    db.unshift(entry);
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(db));
    writeLog(req, 'ADD_ANNOUNCEMENT', message.slice(0, 60));

    // Feature 7 — broadcast to WhatsApp contacts if requested
    if (broadcastWA) {
        try {
            const contacts  = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'));
            const active    = contacts.filter(c => c.active);
            const waConfig  = (() => { try { return JSON.parse(fs.readFileSync(WA_CONFIG_FILE, 'utf8')); } catch(_){ return {}; } })();
            const isMeta    = (waConfig.provider || '').toLowerCase() === 'meta';

            // Personal messages — fire-and-forget
            if (isMeta) {
                active.forEach(c => whatsappNotify(c.phone, null, { _freeText: message }));
            } else {
                active.forEach(c => whatsappNotify(c.phone, 'announcement_broadcast', { message }));
            }
            writeLog(req, 'WA_BROADCAST_ANNOUNCEMENT', `${active.length} personal contacts`);

            // Broadcast group — if configured (non-Meta providers only; Meta doesn't use group IDs)
            if (!isMeta && waConfig.broadcastEnabled && waConfig.broadcastGroupId) {
                try {
                    await whatsappNotify(waConfig.broadcastGroupId, 'announcement_broadcast', { message });
                    writeLog(req, 'WA_BROADCAST_GROUP', waConfig.broadcastGroupId);
                } catch (e) {
                    console.error('[WA broadcast group] error:', e.message);
                }
            }
        } catch (e) {
            console.error('[WA broadcast] error:', e.message);
        }
    }

    res.send({ msg: 'Added', id: entry.id });
});

app.delete('/api/announcement/:id', verifyToken, (req, res) => {
    const id   = parseInt(req.params.id);
    const db   = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const item = db.find(e => e.id === id);
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(db.filter(e => e.id !== id)));
    writeLog(req, 'DELETE_ANNOUNCEMENT', item ? item.message.slice(0, 60) : id);
    res.send({ msg: 'Deleted' });
});


// ── 8. TRIAL BOOKINGS ────────────────────────────────────────
const BOOKING_DB = path.join(__dirname, 'bookings-data.json');
if (!fs.existsSync(BOOKING_DB)) fs.writeFileSync(BOOKING_DB, JSON.stringify([]));

app.get('/api/bookings/list', verifyToken, (req, res) => {
    res.json(JSON.parse(fs.readFileSync(BOOKING_DB)));
});

// Feature 4: Send WA booking_confirmation after adding a booking
app.post('/api/bookings/add', async (req, res) => {
    const { name, phone, email, branch, course, session, age, message } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
    const booking = {
        id:        Date.now().toString(),
        name, phone,
        email:     email   || '',
        branch:    branch  || '',
        course:    course  || '',
        session:   session || '',
        age:       age     || '',
        message:   message || '',
        status:    'Pending',
        createdAt: new Date().toLocaleDateString('en-IN')
    };
    const db = JSON.parse(fs.readFileSync(BOOKING_DB));
    db.unshift(booking);
    fs.writeFileSync(BOOKING_DB, JSON.stringify(db, null, 2));

    // Feature 4 — WhatsApp booking confirmation (fire-and-forget)
    whatsappNotify(phone, 'booking_confirmation', {
        name,
        date:     session || 'your selected date',
        time:     '',
        location: branch  || 'IFSA'
    });

    res.json({ message: 'Booking received!' });
});

app.patch('/api/bookings/:id/status', verifyToken, (req, res) => {
    const { status } = req.body;
    const db  = JSON.parse(fs.readFileSync(BOOKING_DB));
    const idx = db.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    db[idx].status = status;
    fs.writeFileSync(BOOKING_DB, JSON.stringify(db, null, 2));
    res.json({ message: 'Status updated' });
});

app.delete('/api/bookings/:id', verifyToken, (req, res) => {
    const db = JSON.parse(fs.readFileSync(BOOKING_DB)).filter(b => b.id !== req.params.id);
    fs.writeFileSync(BOOKING_DB, JSON.stringify(db, null, 2));
    res.json({ message: 'Deleted' });
});


// ── 9. TESTIMONIALS ──────────────────────────────────────────
app.get('/api/testimonials', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(TESTIMONIALS_FILE)));
});

app.post('/api/testimonials', verifyToken, upload.single('photo'), (req, res) => {
    const { name, belt, quote } = req.body;
    const photo = req.file ? '/uploads/' + req.file.filename : '';
    const db    = JSON.parse(fs.readFileSync(TESTIMONIALS_FILE));
    db.unshift({ id: Date.now().toString(), name, belt, quote, photo });
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Added' });
});

app.delete('/api/testimonials/:id', verifyToken, (req, res) => {
    const db = JSON.parse(fs.readFileSync(TESTIMONIALS_FILE)).filter(t => t.id !== req.params.id);
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Deleted' });
});


// ── 10. TIMETABLE ────────────────────────────────────────────
app.get('/api/timetable', (req, res) => {
    let data = JSON.parse(fs.readFileSync(TIMETABLE_FILE));
    // Optional ?location=<locationId> filter for branch-specific queries
    const locFilter = req.query.location;
    if (locFilter) {
        data = data.filter(e => e.locationId === locFilter || e.locationName === locFilter);
    }
    res.json(data);
});

app.post('/api/timetable', verifyToken, (req, res) => {
    const { day, slot, batch, time, instructor, activities, focus, description,
            locationId, locationName } = req.body;
    const db = JSON.parse(fs.readFileSync(TIMETABLE_FILE));
    // Deduplicate per day + slot + location (backward-compat: empty locationId treated as same bucket)
    const normLocId = (locationId || '').trim();
    const filtered  = db.filter(e =>
        !(e.day === day && e.slot === slot && (e.locationId || '') === normLocId)
    );
    filtered.push({
        id:           Date.now().toString(),
        day, slot, batch, time, instructor,
        // Location fields (new)
        locationId:   normLocId,
        locationName: (locationName || '').trim(),
        // Training-content fields (PDF schedule)
        activities:   Array.isArray(activities) ? activities : (activities ? String(activities).split(',').map(s => s.trim()).filter(Boolean) : []),
        focus:        focus        || '',
        description:  description  || ''
    });
    fs.writeFileSync(TIMETABLE_FILE, JSON.stringify(filtered, null, 2));
    res.json({ message: 'Saved' });
});

app.delete('/api/timetable/:id', verifyToken, (req, res) => {
    const db = JSON.parse(fs.readFileSync(TIMETABLE_FILE)).filter(e => e.id !== req.params.id);
    fs.writeFileSync(TIMETABLE_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Deleted' });
});


// ── PLAN 2 FIX 1: TIMETABLE SLOTS CRUD ───────────────────────
// GET /api/timetable-slots — public, returns array of slot strings
app.get('/api/timetable-slots', (req, res) => {
    try {
        res.json(JSON.parse(fs.readFileSync(TIMETABLE_SLOTS_FILE, 'utf8')));
    } catch (e) {
        res.json(['Morning (6–8 AM)', 'Evening (5–7 PM)']);
    }
});

// POST /api/timetable-slots — add a new slot
app.post('/api/timetable-slots', verifyToken, (req, res) => {
    const { slot } = req.body;
    if (!slot || typeof slot !== 'string' || !slot.trim()) {
        return res.status(400).json({ error: 'slot name is required.' });
    }
    const slots = JSON.parse(fs.readFileSync(TIMETABLE_SLOTS_FILE, 'utf8'));
    const trimmed = slot.trim();
    if (slots.includes(trimmed)) {
        return res.status(409).json({ error: 'Slot already exists.' });
    }
    slots.push(trimmed);
    fs.writeFileSync(TIMETABLE_SLOTS_FILE, JSON.stringify(slots, null, 2));
    writeLog(req, 'ADD_TIMETABLE_SLOT', trimmed);
    res.json({ message: 'Slot added.', slots });
});

// DELETE /api/timetable-slots/:index — remove slot at index; also clean up timetable entries using it
app.delete('/api/timetable-slots/:index', verifyToken, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const slots = JSON.parse(fs.readFileSync(TIMETABLE_SLOTS_FILE, 'utf8'));
    if (isNaN(idx) || idx < 0 || idx >= slots.length) {
        return res.status(400).json({ error: 'Invalid slot index.' });
    }
    const removedSlot = slots[idx];
    slots.splice(idx, 1);
    fs.writeFileSync(TIMETABLE_SLOTS_FILE, JSON.stringify(slots, null, 2));

    // Clean up any timetable entries that reference the deleted slot name
    try {
        const timetable = JSON.parse(fs.readFileSync(TIMETABLE_FILE, 'utf8'));
        const cleaned   = timetable.filter(e => e.slot !== removedSlot);
        if (cleaned.length !== timetable.length) {
            fs.writeFileSync(TIMETABLE_FILE, JSON.stringify(cleaned, null, 2));
        }
    } catch (e) {
        console.error('[timetable-slots] cleanup error:', e.message);
    }

    writeLog(req, 'DELETE_TIMETABLE_SLOT', removedSlot);
    res.json({ message: 'Slot deleted.', removed: removedSlot, slots });
});


// ── ADMIN ACTIVITY LOG ────────────────────────────────────────
app.get('/api/admin/log', verifyToken, (req, res) => {
    try {
        const log = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
        res.json(log.slice(0, 20));
    } catch (e) { res.json([]); }
});


// ── RESPONSIVE HERO VIDEOS ────────────────────────────────────
function readSiteData()      { try { return JSON.parse(fs.readFileSync(SITE_DATA_FILE, 'utf8')); } catch (_) { return { heroVideos: {}, programImages: {} }; } }
function writeSiteData(data) { fs.writeFileSync(SITE_DATA_FILE, JSON.stringify(data, null, 2)); }

const heroVideoUpload = multer({
    dest: HERO_VIDEO_PATH,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => { cb(null, /video\/(mp4|webm|quicktime|x-matroska)/.test(file.mimetype)); }
}).fields([{ name: 'desktopVideo', maxCount: 1 }, { name: 'mobileVideo', maxCount: 1 }]);

app.get('/api/hero-videos', (req, res) => {
    res.json(readSiteData().heroVideos || {});
});

app.post('/api/hero-videos', verifyToken, (req, res) => {
    heroVideoUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const data = readSiteData();
        data.heroVideos = data.heroVideos || {};
        ['desktop', 'mobile'].forEach(slot => {
            const field = slot === 'desktop' ? 'desktopVideo' : 'mobileVideo';
            if (req.files && req.files[field] && req.files[field][0]) {
                const f   = req.files[field][0];
                const ext = /webm/.test(f.mimetype) ? '.webm' : '.mp4';
                const dest = path.join(HERO_VIDEO_PATH, 'hero-' + slot + ext);
                ['.mp4', '.webm'].forEach(e => { try { fs.unlinkSync(path.join(HERO_VIDEO_PATH, 'hero-' + slot + e)); } catch (_) {} });
                fs.renameSync(f.path, dest);
                data.heroVideos[slot] = '/uploads/hero-video/hero-' + slot + ext;
            }
        });
        writeSiteData(data);
        writeLog(req, 'UPLOAD_HERO_VIDEO', Object.keys(req.files || {}).join(', '));
        res.json({ success: true, heroVideos: data.heroVideos });
    });
});

app.delete('/api/hero-videos/:slot', verifyToken, (req, res) => {
    const slot = req.params.slot;
    if (!['desktop', 'mobile'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const data = readSiteData();
    const src  = data.heroVideos && data.heroVideos[slot];
    if (src) {
        try { fs.unlinkSync(path.join(__dirname, src)); } catch (_) {}
        delete data.heroVideos[slot];
        writeSiteData(data);
    }
    writeLog(req, 'DELETE_HERO_VIDEO', slot);
    res.json({ success: true });
});


// ── PROGRAM CARD IMAGES ───────────────────────────────────────
const VALID_PROGRAM_IDS = ['kids-karate', 'adult-karate', 'karate-fitness'];

const programImageUpload = multer({
    dest: ROOT_UPLOAD_PATH,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => { cb(null, ALLOWED_IMAGE_TYPES.includes(file.mimetype)); }
}).single('image');

app.get('/api/program-images', (req, res) => {
    res.json(readSiteData().programImages || {});
});

app.post('/api/program-images/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    if (!VALID_PROGRAM_IDS.includes(id)) return res.status(400).json({ error: 'Unknown program id' });
    programImageUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file received' });
        await compressImage(req.file.path);
        const webpPath  = req.file.path.replace(/\.[^.]+$/, '.webp');
        const finalName = 'program-' + id + '.webp';
        const finalPath = path.join(ROOT_UPLOAD_PATH, finalName);
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].forEach(e => {
            try { fs.unlinkSync(path.join(ROOT_UPLOAD_PATH, 'program-' + id + e)); } catch (_) {}
        });
        fs.renameSync(fs.existsSync(webpPath) ? webpPath : req.file.path, finalPath);
        const data = readSiteData();
        data.programImages = data.programImages || {};
        data.programImages[id] = '/uploads/' + finalName;
        writeSiteData(data);
        writeLog(req, 'UPLOAD_PROGRAM_IMAGE', id);
        res.json({ success: true, src: data.programImages[id] });
    });
});

app.delete('/api/program-images/:id', verifyToken, (req, res) => {
    const id  = req.params.id;
    if (!VALID_PROGRAM_IDS.includes(id)) return res.status(400).json({ error: 'Unknown program id' });
    const data = readSiteData();
    const src  = data.programImages && data.programImages[id];
    if (src) {
        try { fs.unlinkSync(path.join(__dirname, src)); } catch (_) {}
        delete data.programImages[id];
        writeSiteData(data);
    }
    writeLog(req, 'DELETE_PROGRAM_IMAGE', id);
    res.json({ success: true });
});


// ============================================================
//  PHASE A — NEW ROUTES
// ============================================================

// ── FEATURE 1: GOOGLE REVIEWS (multi-branch) ──────────────────
//
// Storage format (google-reviews.json):
// {
//   branches: {
//     "main":    { label, placeId, rating, totalRatings, reviews[], lastFetched, manualOverride },
//     "branch2": { label, placeId, rating, totalRatings, reviews[], lastFetched, manualOverride },
//     ...
//   }
// }
//
// Legacy single-branch files are migrated automatically on first read.

const BRANCH_DEFAULTS = () => ({
    label: 'Main Branch', placeId: '', rating: 0, totalRatings: 0,
    reviews: [], lastFetched: null, manualOverride: false
});

function readGrFile() {
    try {
        const raw = JSON.parse(fs.readFileSync(GOOGLE_REVIEWS_FILE, 'utf8'));
        // Migrate legacy single-branch format
        if (!raw.branches) {
            const migrated = { branches: { main: { ...BRANCH_DEFAULTS(), ...raw, label: 'Main Branch' } } };
            fs.writeFileSync(GOOGLE_REVIEWS_FILE, JSON.stringify(migrated, null, 2));
            return migrated;
        }
        return raw;
    } catch (_) {
        return { branches: { main: BRANCH_DEFAULTS() } };
    }
}

function writeGrFile(data) {
    fs.writeFileSync(GOOGLE_REVIEWS_FILE, JSON.stringify(data, null, 2));
}

function getBranch(data, branchId) {
    return data.branches[branchId] || null;
}

// Sanitise branch ID: alphanumeric + underscores, max 32 chars
function sanitiseBranchId(id) {
    return String(id || 'main').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'main';
}

// GET /api/google-reviews — public
// Returns all branches so the frontend can show reviews from every location.
// Shape: { branches: { main: {...}, ... }, allReviews: [...] }
app.get('/api/google-reviews', (req, res) => {
    const data = readGrFile();
    // Build a flat allReviews array (each review tagged with branchId + label)
    const allReviews = [];
    for (const [bid, branch] of Object.entries(data.branches)) {
        (branch.reviews || []).forEach(r => allReviews.push({ ...r, branchId: bid, branchLabel: branch.label || bid }));
    }
    res.json({ ...data, allReviews });
});

// GET /api/google-reviews/branches — admin helper: list branch ids + labels
app.get('/api/google-reviews/branches', verifyToken, (req, res) => {
    const data = readGrFile();
    res.json(Object.entries(data.branches).map(([id, b]) => ({ id, label: b.label || id })));
});

// POST /api/google-reviews/branches — create or rename a branch
app.post('/api/google-reviews/branches', verifyToken, (req, res) => {
    const { branchId, label } = req.body;
    const bid = sanitiseBranchId(branchId);
    if (!bid) return res.status(400).json({ error: 'Invalid branchId' });
    const data = readGrFile();
    if (!data.branches[bid]) data.branches[bid] = BRANCH_DEFAULTS();
    if (label) data.branches[bid].label = String(label).slice(0, 80);
    writeGrFile(data);
    writeLog(req, 'CREATE_GOOGLE_BRANCH', `branch=${bid}`);
    res.json({ message: 'Branch saved', branches: Object.keys(data.branches) });
});

// DELETE /api/google-reviews/branches/:branchId — remove a branch (cannot remove last one)
app.delete('/api/google-reviews/branches/:branchId', verifyToken, (req, res) => {
    const bid  = sanitiseBranchId(req.params.branchId);
    const data = readGrFile();
    if (!data.branches[bid])           return res.status(404).json({ error: 'Branch not found' });
    if (Object.keys(data.branches).length <= 1) return res.status(400).json({ error: 'Cannot delete the last branch' });
    delete data.branches[bid];
    writeGrFile(data);
    writeLog(req, 'DELETE_GOOGLE_BRANCH', `branch=${bid}`);
    res.json({ message: 'Branch deleted' });
});

// POST /api/google-reviews/settings?branch=<id> — save Place ID + manual override
app.post('/api/google-reviews/settings', verifyToken, (req, res) => {
    const bid = sanitiseBranchId(req.query.branch || req.body.branch);
    const { placeId, apiKey, manualOverride, rating, totalRatings, label } = req.body;
    const data    = readGrFile();
    if (!data.branches[bid]) data.branches[bid] = BRANCH_DEFAULTS();
    const current = data.branches[bid];
    data.branches[bid] = {
        ...current,
        label:          label          !== undefined ? String(label).slice(0, 80)      : current.label,
        placeId:        placeId        !== undefined ? placeId                          : current.placeId,
        manualOverride: manualOverride !== undefined ? !!manualOverride                 : current.manualOverride,
        rating:         manualOverride && rating       !== undefined ? Number(rating)       : current.rating,
        totalRatings:   manualOverride && totalRatings !== undefined ? Number(totalRatings) : current.totalRatings,
    };
    if (apiKey) {
        try {
            const siteData = readSiteData();
            // Store per-branch key as _googlePlacesApiKey_<bid>, fall back to shared key
            siteData[`_googlePlacesApiKey_${bid}`] = apiKey;
            if (bid === 'main') siteData._googlePlacesApiKey = apiKey; // keep legacy key in sync
            writeSiteData(siteData);
        } catch (_) {}
    }
    writeGrFile(data);
    writeLog(req, 'UPDATE_GOOGLE_REVIEWS_SETTINGS', `branch=${bid}, manualOverride=${data.branches[bid].manualOverride}`);
    res.json({ message: 'Saved', data: data.branches[bid] });
});

// POST /api/google-reviews/reviews?branch=<id> — save manual reviews array for one branch
app.post('/api/google-reviews/reviews', verifyToken, (req, res) => {
    const bid     = sanitiseBranchId(req.query.branch || req.body.branch);
    const { reviews } = req.body;
    if (!Array.isArray(reviews)) return res.status(400).json({ error: 'reviews must be an array' });
    const data = readGrFile();
    if (!data.branches[bid]) data.branches[bid] = BRANCH_DEFAULTS();
    const sanitized = reviews.map(r => ({
        author: String(r.author  || '').slice(0, 100),
        text:   String(r.text    || '').slice(0, 1000),
        rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
        time:   String(r.time    || '').slice(0, 20),
        color:  ['amber','blue','green','purple','rose','cyan'].includes(r.color) ? r.color : 'amber'
    }));
    data.branches[bid].reviews = sanitized;
    writeGrFile(data);
    writeLog(req, 'UPDATE_GOOGLE_REVIEWS', `branch=${bid}, count=${sanitized.length}`);
    res.json({ message: 'Reviews saved', data: data.branches[bid] });
});

// POST /api/google-reviews/refresh?branch=<id> — force re-fetch from Places API for one branch
app.post('/api/google-reviews/refresh', verifyToken, async (req, res) => {
    const bid = sanitiseBranchId(req.query.branch || req.body.branch);
    try {
        const data    = readGrFile();
        if (!data.branches[bid]) return res.status(404).json({ error: 'Branch not found' });
        const current = data.branches[bid];
        const siteData = readSiteData();
        const apiKey   = siteData[`_googlePlacesApiKey_${bid}`] || siteData._googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY;
        const placeId  = current.placeId;

        if (!apiKey || !placeId) {
            return res.status(400).json({ error: 'Google Places API key and Place ID must be configured for this branch first.' });
        }

        const fields  = 'rating,user_ratings_total,reviews';
        const apiUrl  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;

        const placeData = await new Promise((resolve, reject) => {
            https.get(apiUrl, (r) => {
                let body = '';
                r.on('data', chunk => { body += chunk; });
                r.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Invalid JSON from Places API')); }
                });
            }).on('error', reject);
        });

        if (placeData.status !== 'OK') {
            return res.status(502).json({ error: `Places API error: ${placeData.status}` });
        }

        const result  = placeData.result || {};
        const reviews = (result.reviews || []).slice(0, 5).map(r => ({
            author: r.author_name,
            rating: r.rating,
            text:   r.text,
            time:   new Date(r.time * 1000).toISOString().slice(0, 10)
        }));

        data.branches[bid] = {
            ...current,
            rating:         result.rating             || current.rating,
            totalRatings:   result.user_ratings_total  || current.totalRatings,
            reviews,
            lastFetched:    new Date().toISOString(),
            manualOverride: false
        };
        writeGrFile(data);
        writeLog(req, 'REFRESH_GOOGLE_REVIEWS', `branch=${bid}, rating=${data.branches[bid].rating}, count=${data.branches[bid].totalRatings}`);
        res.json({ message: 'Refreshed', data: data.branches[bid] });

    } catch (e) {
        console.error('[Google Reviews refresh]', e.message);
        res.status(500).json({ error: 'Failed to fetch from Google Places API.' });
    }
});


// ── FEATURE 2: ACHIEVEMENTS CRUD ─────────────────────────────
// GET /api/achievements — public
app.get('/api/achievements', (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf8'))); }
    catch (e) { res.json([]); }
});

// POST /api/achievements — add (accepts optional image upload)
app.post('/api/achievements', verifyToken, upload.single('image'), async (req, res) => {
    const { icon, title, subtitle, year, category } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    let imagePath = '';
    if (req.file) {
        await compressImage(req.file.path);
        const webpPath = req.file.path.replace(/\.[^.]+$/, '.webp');
        const finalFile = fs.existsSync(webpPath) ? path.basename(webpPath) : req.file.filename;
        imagePath = '/uploads/achievements/' + finalFile;
    }

    const db  = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf8'));
    const entry = {
        id:       'ach_' + Date.now(),
        icon:     icon     || '🏅',
        image:    imagePath,
        title,
        subtitle: subtitle || '',
        year:     year     || String(new Date().getFullYear()),
        category: category || 'tournament'
    };
    db.unshift(entry);
    fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(db, null, 2));
    writeLog(req, 'ADD_ACHIEVEMENT', title);
    res.json({ message: 'Added', achievement: entry });
});

// PUT /api/achievements/:id — update (accepts optional new image)
app.put('/api/achievements/:id', verifyToken, upload.single('image'), async (req, res) => {
    const db  = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf8'));
    const idx = db.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Achievement not found.' });

    let imagePath = db[idx].image || '';
    if (req.file) {
        // Delete old image if present
        if (db[idx].image) {
            try { fs.unlinkSync(path.join(__dirname, db[idx].image)); } catch (_) {}
        }
        await compressImage(req.file.path);
        const webpPath = req.file.path.replace(/\.[^.]+$/, '.webp');
        const finalFile = fs.existsSync(webpPath) ? path.basename(webpPath) : req.file.filename;
        imagePath = '/uploads/achievements/' + finalFile;
    }

    db[idx] = { ...db[idx], ...req.body, image: imagePath, id: db[idx].id };
    fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(db, null, 2));
    writeLog(req, 'UPDATE_ACHIEVEMENT', db[idx].title);
    res.json({ message: 'Updated', achievement: db[idx] });
});

// DELETE /api/achievements/:id
app.delete('/api/achievements/:id', verifyToken, (req, res) => {
    const db   = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf8'));
    const item = db.find(a => a.id === req.params.id);
    // Clean up image file if present
    if (item && item.image) {
        try { fs.unlinkSync(path.join(__dirname, item.image)); } catch (_) {}
    }
    const filtered = db.filter(a => a.id !== req.params.id);
    fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(filtered, null, 2));
    writeLog(req, 'DELETE_ACHIEVEMENT', item ? item.title : req.params.id);
    res.json({ message: 'Deleted' });
});


// ── FEATURE 3: GRADING SYLLABUS PDF ──────────────────────────
// GET /api/syllabus — public, returns { pdfPath, filename } or {}
app.get('/api/syllabus', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf8'));
        res.json(data.pdfPath ? data : {});
    } catch (e) { res.json({}); }
});

// POST /api/syllabus — upload new PDF (replaces existing)
const syllabusUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, SYLLABUS_PATH),
        filename:    (req, file, cb) => cb(null, 'grading-syllabus.pdf')
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed for the syllabus.'), false);
    },
    limits: { fileSize: 50 * 1024 * 1024 }
}).single('pdf');

app.post('/api/syllabus', verifyToken, (req, res) => {
    syllabusUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
        const data = {
            pdfPath:    '/uploads/syllabus/grading-syllabus.pdf',
            filename:   req.file.originalname,
            uploadedAt: new Date().toISOString()
        };
        fs.writeFileSync(SYLLABUS_FILE, JSON.stringify(data, null, 2));
        writeLog(req, 'UPLOAD_SYLLABUS', req.file.originalname);
        res.json({ message: 'Syllabus uploaded.', data });
    });
});

// DELETE /api/syllabus — remove the PDF
app.delete('/api/syllabus', verifyToken, (req, res) => {
    try {
        const pdfPath = path.join(SYLLABUS_PATH, 'grading-syllabus.pdf');
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        fs.writeFileSync(SYLLABUS_FILE, JSON.stringify({}));
        writeLog(req, 'DELETE_SYLLABUS', 'grading-syllabus.pdf');
        res.json({ message: 'Syllabus removed.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to remove syllabus.' });
    }
});


// ── FEATURE 5: UPI PAYMENT ────────────────────────────────────

// GET /api/payment-settings — public (UPI ID shown on payment page)
app.get('/api/payment-settings', (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(PAYMENT_SETTINGS_FILE, 'utf8'))); }
    catch (e) { res.json({ upiId: '', paymentTypes: [] }); }
});

// POST /api/payment-settings — admin sets UPI ID + payment types
app.post('/api/payment-settings', verifyToken, (req, res) => {
    const { upiId, paymentTypes } = req.body;
    const settings = { upiId: upiId || '', paymentTypes: Array.isArray(paymentTypes) ? paymentTypes : [] };
    fs.writeFileSync(PAYMENT_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    writeLog(req, 'UPDATE_PAYMENT_SETTINGS', `upiId=${upiId}`);
    res.json({ message: 'Saved', settings });
});

// POST /api/payment/initiate — create a pending payment record, return UPI link
app.post('/api/payment/initiate', (req, res) => {
    const { name, phone, branch, type, amount, month } = req.body;
    if (!name || !phone || !amount) return res.status(400).json({ error: 'name, phone, and amount are required.' });

    let settings = { upiId: '', paymentTypes: [] };
    try { settings = JSON.parse(fs.readFileSync(PAYMENT_SETTINGS_FILE, 'utf8')); } catch (_) {}

    const id     = 'pay_' + Date.now();
    const note   = `${type || 'Fee'} - ${name}`;
    const upiLink = settings.upiId
        ? `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=IFSA&am=${encodeURIComponent(amount)}&tn=${encodeURIComponent(note)}&cu=INR`
        : '';

    const record = {
        id, name, phone: String(phone),
        branch:     branch || '',
        type:       type   || 'Monthly Fees',
        amount:     Number(amount),
        month:      month  || '',
        upiRef:     '',
        screenshotUrl: '',
        status:     'pending',
        createdAt:  new Date().toISOString()
    };
    const db = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    db.unshift(record);
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(db, null, 2));

    res.json({ message: 'Payment initiated.', id, upiLink, upiId: settings.upiId });
});

// POST /api/payment/confirm — upload screenshot, mark record pending-review
const paymentScreenshotUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, PAYMENTS_UPLOAD_PATH),
        filename:    (req, file, cb) => cb(null, req.body.id + path.extname(file.originalname).toLowerCase())
    }),
    fileFilter: (req, file, cb) => {
        if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES].includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images or PDFs allowed.'), false);
    },
    limits: { fileSize: 20 * 1024 * 1024 }
}).single('screenshot');

app.post('/api/payment/confirm', (req, res) => {
    paymentScreenshotUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const { id, upiRef } = req.body;
        if (!id) return res.status(400).json({ error: 'Payment id is required.' });

        const db  = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
        const idx = db.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Payment record not found.' });

        db[idx].status        = 'pending-review';
        db[idx].upiRef        = upiRef || '';
        db[idx].screenshotUrl = req.file ? `/uploads/payments/${req.file.filename}` : '';
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(db, null, 2));

        // Feature 4 — fee_receipt WA notify
        whatsappNotify(db[idx].phone, 'fee_receipt', {
            name:      db[idx].name,
            amount:    db[idx].amount,
            month:     db[idx].month || db[idx].type,
            receiptId: id
        });

        res.json({ message: 'Payment confirmation received. Admin will verify shortly.' });
    });
});

// GET /api/payments — admin: all payment records
app.get('/api/payments', verifyToken, (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'))); }
    catch (e) { res.json([]); }
});

// PUT /api/payments/:id — admin: approve or reject
app.put('/api/payments/:id', verifyToken, (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'pending-review', 'approved', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    const db  = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    const idx = db.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Payment record not found.' });

    db[idx].status = status;
    db[idx].reviewedAt = new Date().toISOString();
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(db, null, 2));
    writeLog(req, `PAYMENT_${status.toUpperCase()}`, `${db[idx].name} ₹${db[idx].amount}`);
    res.json({ message: 'Updated', payment: db[idx] });
});


// ── FEATURES 4 & 7: WHATSAPP CONFIG / CONTACTS / BROADCAST ───

// POST /api/wa-config — admin saves gateway credentials
app.post('/api/wa-config', verifyToken, (req, res) => {
    const { gatewayUrl, apiToken, fromPhone, provider, broadcastGroupId, broadcastEnabled } = req.body;
    const config = {
        gatewayUrl:       gatewayUrl       || '',
        apiToken:         apiToken         || '',
        fromPhone:        fromPhone        || '',
        provider:         provider         || 'custom',
        broadcastGroupId: broadcastGroupId || '',
        broadcastEnabled: broadcastEnabled !== undefined ? !!broadcastEnabled : false
    };
    fs.writeFileSync(WA_CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog(req, 'UPDATE_WA_CONFIG', `provider=${config.provider}`);
    res.json({ message: 'WhatsApp config saved.' });
});

// GET /api/wa-config — admin retrieves config (token masked)
app.get('/api/wa-config', verifyToken, (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(WA_CONFIG_FILE, 'utf8'));
        res.json({ ...config, apiToken: config.apiToken ? '••••••••' : '' }); // Never expose token
    } catch (e) {
        res.json({});
    }
});

// POST /api/wa-config/test — send a test message to admin's own number
app.post('/api/wa-config/test', verifyToken, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required.' });
    await whatsappNotify(phone, 'booking_confirmation', {
        name: 'Admin Test', date: new Date().toLocaleDateString('en-IN'),
        time: '', location: 'IFSA Test'
    });
    res.json({ message: 'Test message sent (if gateway is correctly configured).' });
});

// GET /api/wa-contacts — admin: list all contacts
app.get('/api/wa-contacts', verifyToken, (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'))); }
    catch (e) { res.json([]); }
});

// POST /api/wa-contacts — admin: add a contact
app.post('/api/wa-contacts', verifyToken, (req, res) => {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required.' });
    const normPhone = String(phone).replace(/\D/g, '');
    const db = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'));
    if (db.find(c => c.phone === normPhone)) return res.status(409).json({ error: 'Contact already exists.' });
    const contact = { name: name || '', phone: normPhone, active: true, addedAt: new Date().toISOString() };
    db.push(contact);
    fs.writeFileSync(WA_CONTACTS_FILE, JSON.stringify(db, null, 2));
    writeLog(req, 'ADD_WA_CONTACT', `${name} (${normPhone})`);
    res.json({ message: 'Contact added.', contact });
});

// DELETE /api/wa-contacts/:phone — admin: remove a contact
app.delete('/api/wa-contacts/:phone', verifyToken, (req, res) => {
    const normPhone = String(req.params.phone).replace(/\D/g, '');
    const db        = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8')).filter(c => c.phone !== normPhone);
    fs.writeFileSync(WA_CONTACTS_FILE, JSON.stringify(db, null, 2));
    writeLog(req, 'DELETE_WA_CONTACT', normPhone);
    res.json({ message: 'Contact removed.' });
});

// PATCH /api/wa-contacts/:phone/toggle — enable/disable a contact
app.patch('/api/wa-contacts/:phone/toggle', verifyToken, (req, res) => {
    const normPhone = String(req.params.phone).replace(/\D/g, '');
    const db  = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'));
    const idx = db.findIndex(c => c.phone === normPhone);
    if (idx === -1) return res.status(404).json({ error: 'Contact not found.' });
    db[idx].active = !db[idx].active;
    fs.writeFileSync(WA_CONTACTS_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Toggled.', active: db[idx].active });
});

// POST /api/wa-broadcast — send a custom message to all active contacts
// Meta provider: sends free-form text (no template required).
// Other providers: sends via template 'announcement_broadcast'.
app.post('/api/wa-broadcast', verifyToken, async (req, res) => {
    const { message, templateName } = req.body;
    if (!message && !templateName) return res.status(400).json({ error: 'message or templateName is required.' });

    const contacts = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'));
    const active   = contacts.filter(c => c.active);
    if (active.length === 0) return res.json({ message: 'No active contacts to broadcast to.', sent: 0 });

    // Detect Meta provider to use free-form text instead of template
    let isMeta = false;
    try {
        const cfg = JSON.parse(fs.readFileSync(WA_CONFIG_FILE, 'utf8'));
        isMeta = (cfg.provider || '').toLowerCase() === 'meta';
    } catch (_) {}

    if (isMeta && message) {
        // Free-form text — no template approval needed
        active.forEach(c => whatsappNotify(c.phone, null, { _freeText: message }));
    } else {
        active.forEach(c => whatsappNotify(c.phone, templateName || 'announcement_broadcast', { message: message || '' }));
    }

    writeLog(req, 'WA_BROADCAST', `${active.length} contacts — "${(message || templateName || '').slice(0, 60)}"`);
    res.json({ message: `Broadcast sent to ${active.length} contacts.`, sent: active.length });
});


// ============================================================
//  PHASE 1 — NEW ROUTES
// ============================================================

// ── FIX 5: HERO STATS ────────────────────────────────────────
// GET /api/stats — public, returns all four counter values
app.get('/api/stats', (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'))); }
    catch (e) {
        res.json({
            years:      { value: 15,  suffix: '+', label: 'Years'       },
            students:   { value: 500, suffix: '+', label: 'Students'    },
            blackBelts: { value: 50,  suffix: '+', label: 'Black Belts' },
            locations:  { value: 3,   suffix: '',  label: 'Locations'   }
        });
    }
});

// POST /api/stats — admin updates counter values
app.post('/api/stats', verifyToken, (req, res) => {
    const allowed = ['years', 'students', 'blackBelts', 'locations'];
    let current = {};
    try { current = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (_) {}

    allowed.forEach(key => {
        if (req.body[key] !== undefined) {
            const incoming = req.body[key];
            current[key] = {
                value:  incoming.value  !== undefined ? Number(incoming.value)  : (current[key] || {}).value,
                suffix: incoming.suffix !== undefined ? String(incoming.suffix) : (current[key] || {}).suffix || '',
                label:  incoming.label  !== undefined ? String(incoming.label)  : (current[key] || {}).label  || key
            };
        }
    });

    fs.writeFileSync(STATS_FILE, JSON.stringify(current, null, 2));
    writeLog(req, 'UPDATE_STATS', JSON.stringify(Object.fromEntries(allowed.map(k => [k, (current[k] || {}).value]))));
    res.json({ message: 'Stats saved.', stats: current });
});


// ── FIX 2: WA CONTACTS IMPORT ────────────────────────────────
// POST /api/wa-contacts/import — upload a CSV/TXT file of phone numbers
//   CSV format:  name,phone   (header row optional)
//   TXT format:  one phone number per line (with optional name before comma)
const waContactsImport = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },  // 5 MB max
    fileFilter: (req, file, cb) => {
        const ok = ['text/csv', 'text/plain', 'application/csv',
                    'application/vnd.ms-excel'].includes(file.mimetype)
                   || file.originalname.match(/\.(csv|txt)$/i);
        if (ok) cb(null, true);
        else cb(new Error('Only CSV or TXT files are accepted for contact import.'), false);
    }
}).single('file');

app.post('/api/wa-contacts/import', verifyToken, (req, res) => {
    waContactsImport(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const text  = req.file.buffer.toString('utf8');
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // Detect whether first line is a header
        const hasHeader = /^[a-z_\s"']+,[a-z_\s"']+$/i.test(lines[0]) &&
                          !/\d{7,}/.test(lines[0]);
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const existing = JSON.parse(fs.readFileSync(WA_CONTACTS_FILE, 'utf8'));
        const existingPhones = new Set(existing.map(c => c.phone));

        let added = 0, skipped = 0;

        dataLines.forEach(line => {
            const parts    = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
            let name  = '';
            let phone = '';

            if (parts.length >= 2) {
                // Could be "name,phone" or "phone,name" — detect by which part has digits
                if (/\d{7,}/.test(parts[1])) {
                    name  = parts[0];
                    phone = parts[1];
                } else if (/\d{7,}/.test(parts[0])) {
                    phone = parts[0];
                    name  = parts[1] || '';
                }
            } else {
                phone = parts[0];
            }

            const normPhone = phone.replace(/\D/g, '');
            if (normPhone.length < 7) { skipped++; return; }

            if (existingPhones.has(normPhone)) { skipped++; return; }

            existing.push({
                name:    name || 'Contact',
                phone:   normPhone,
                active:  true,
                addedAt: new Date().toISOString(),
                source:  'import'
            });
            existingPhones.add(normPhone);
            added++;
        });

        fs.writeFileSync(WA_CONTACTS_FILE, JSON.stringify(existing, null, 2));
        writeLog(req, 'IMPORT_WA_CONTACTS', `added=${added}, skipped=${skipped}`);
        res.json({ message: 'Import complete.', added, skipped, total: existing.length });
    });
});


// ============================================================
//  PHASE 3 — STUDENT AUTH + ADMIN STUDENT MANAGEMENT ROUTES
// ============================================================

// Rate limiter for student login (separate from admin)
const studentLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Helper: safe read students file ──────────────────────────
function readStudents() {
    try { return JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8')); }
    catch (_) { return []; }
}
function writeStudents(data) {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(data, null, 2));
}

// ── POST /api/student/login ───────────────────────────────────
app.post('/api/student/login', studentLoginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const students = readStudents();
    const student  = students.find(s => s.email.toLowerCase() === email.toLowerCase().trim());

    if (!student || !student.passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (student.status !== 'active') {
        return res.status(403).json({ error: 'Your account is inactive. Please contact admin.' });
    }

    const valid = await bcrypt.compare(password, student.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
        { id: student.id, name: student.name, email: student.email,
          batchId: student.batchId, locationId: student.locationId, role: 'student' },
        STUDENT_JWT_SECRET,
        { expiresIn: '7d' }
    );

    // Set httpOnly cookie
    res.setHeader('Set-Cookie',
        `ifsa_student_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Strict`
    );

    res.json({
        message: 'Login successful.',
        student: {
            id: student.id, name: student.name, email: student.email,
            beltLevel: student.beltLevel, batchId: student.batchId,
            locationId: student.locationId, enrolledDate: student.enrolledDate,
            requiresPasswordChange: student.requiresPasswordChange || false
        }
    });
});

// ── POST /api/student/logout ──────────────────────────────────
app.post('/api/student/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'ifsa_student_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
    res.json({ message: 'Logged out.' });
});

// ── GET /api/student/me ───────────────────────────────────────
app.get('/api/student/me', verifyStudentToken, (req, res) => {
    const students = readStudents();
    const student  = students.find(s => s.id === req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const { passwordHash, ...safe } = student;
    res.json(safe);
});

// ── GET /api/student/attendance ──────────────────────────────
app.get('/api/student/attendance', verifyStudentToken, (req, res) => {
    const students = readStudents();
    const student  = students.find(s => s.id === req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json(student.attendance || []);
});

// ── GET /api/student/payments ─────────────────────────────────
app.get('/api/student/payments', verifyStudentToken, (req, res) => {
    const students = readStudents();
    const student  = students.find(s => s.id === req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json(student.payments || []);
});

// ── GET /api/student/grading ──────────────────────────────────
app.get('/api/student/grading', verifyStudentToken, (req, res) => {
    const students = readStudents();
    const student  = students.find(s => s.id === req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json(student.gradingHistory || []);
});

// ── POST /api/student/change-password ────────────────────────
app.post('/api/student/change-password', verifyStudentToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const students = readStudents();
    const idx      = students.findIndex(s => s.id === req.student.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

    // If not a forced first-change, verify current password
    if (!students[idx].requiresPasswordChange) {
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' });
        const valid = await bcrypt.compare(currentPassword, students[idx].passwordHash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    students[idx].passwordHash = await bcrypt.hash(newPassword, 12);
    students[idx].requiresPasswordChange = false;
    writeStudents(students);
    res.json({ message: 'Password changed successfully.' });
});

// ── PUT /api/student/contact ──────────────────────────────────
app.put('/api/student/contact', verifyStudentToken, (req, res) => {
    const { email, phone } = req.body;
    const students = readStudents();
    const idx      = students.findIndex(s => s.id === req.student.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });
    if (email) students[idx].email = String(email).trim().toLowerCase();
    if (phone) students[idx].phone = String(phone).trim();
    writeStudents(students);
    res.json({ message: 'Contact info updated.' });
});


// ── GET /api/admin/students ───────────────────────────────────
app.get('/api/admin/students', verifyToken, (req, res) => {
    const students = readStudents().map(({ passwordHash, ...s }) => s);
    res.json(students);
});

// ── POST /api/admin/students ──────────────────────────────────
app.post('/api/admin/students', verifyToken, async (req, res) => {
    const { name, email, phone, batchId, locationId, beltLevel, tempPassword } = req.body;
    if (!name || !email || !tempPassword) {
        return res.status(400).json({ error: 'name, email, and tempPassword are required.' });
    }

    const students = readStudents();
    if (students.find(s => s.email.toLowerCase() === email.toLowerCase())) {
        return res.status(409).json({ error: 'A student with this email already exists.' });
    }

    const newStudent = {
        id:                     'student_' + Date.now(),
        name:                   String(name).trim(),
        email:                  String(email).trim().toLowerCase(),
        phone:                  String(phone || '').trim(),
        passwordHash:           await bcrypt.hash(tempPassword, 12),
        requiresPasswordChange: true,
        batchId:                batchId     || '',
        locationId:             locationId  || '',
        beltLevel:              beltLevel   || 'White Belt',
        enrolledDate:           new Date().toISOString().slice(0, 10),
        status:                 'active',
        attendance:             [],
        payments:               [],
        gradingHistory:         [],
        createdAt:              new Date().toISOString()
    };

    students.push(newStudent);
    writeStudents(students);
    writeLog(req, 'ADD_STUDENT', newStudent.name);
    const { passwordHash, ...safe } = newStudent;
    res.json({ message: 'Student added.', student: safe });
});

// ── PUT /api/admin/students/:id ───────────────────────────────
app.put('/api/admin/students/:id', verifyToken, async (req, res) => {
    const students = readStudents();
    const idx = students.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

    const allowed = ['name', 'email', 'phone', 'batchId', 'locationId', 'beltLevel', 'status', 'enrolledDate'];
    allowed.forEach(k => { if (req.body[k] !== undefined) students[idx][k] = req.body[k]; });

    if (req.body.tempPassword) {
        students[idx].passwordHash           = await bcrypt.hash(req.body.tempPassword, 12);
        students[idx].requiresPasswordChange = true;
    }

    writeStudents(students);
    writeLog(req, 'EDIT_STUDENT', students[idx].name);
    const { passwordHash, ...safe } = students[idx];
    res.json({ message: 'Student updated.', student: safe });
});

// ── DELETE /api/admin/students/:id ───────────────────────────
app.delete('/api/admin/students/:id', verifyToken, (req, res) => {
    let students = readStudents();
    const target = students.find(s => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Student not found.' });
    students = students.filter(s => s.id !== req.params.id);
    writeStudents(students);
    writeLog(req, 'DELETE_STUDENT', target.name);
    res.json({ message: 'Student deleted.' });
});

// ── POST /api/admin/students/:id/attendance ───────────────────
app.post('/api/admin/students/:id/attendance', verifyToken, (req, res) => {
    const { date, status } = req.body;
    if (!date || !['present', 'absent', 'no-class'].includes(status)) {
        return res.status(400).json({ error: 'date and status (present|absent|no-class) are required.' });
    }

    const students = readStudents();
    const idx = students.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

    const att = students[idx].attendance || [];
    const existing = att.findIndex(a => a.date === date);
    if (existing > -1) att[existing].status = status;
    else att.push({ date, status });
    att.sort((a, b) => a.date.localeCompare(b.date));
    students[idx].attendance = att;

    writeStudents(students);
    writeLog(req, 'MARK_ATTENDANCE', `${students[idx].name} ${date}=${status}`);
    res.json({ message: 'Attendance recorded.', attendance: att });
});

// ── POST /api/admin/students/:id/payments ────────────────────
app.post('/api/admin/students/:id/payments', verifyToken, (req, res) => {
    const { month, amount, datePaid, receiptNo, type } = req.body;
    if (!month || !amount) return res.status(400).json({ error: 'month and amount are required.' });

    const students = readStudents();
    const idx = students.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

    const payment = {
        id:        'pay_' + Date.now(),
        month:     String(month).trim(),
        amount:    Number(amount),
        datePaid:  datePaid  || new Date().toISOString().slice(0, 10),
        receiptNo: receiptNo || `R${Date.now()}`,
        type:      type      || 'Monthly Fees',
        recordedBy: req.user.name || req.user.username
    };

    students[idx].payments = students[idx].payments || [];
    students[idx].payments.unshift(payment);
    writeStudents(students);
    writeLog(req, 'RECORD_PAYMENT', `${students[idx].name} ₹${amount} ${month}`);
    res.json({ message: 'Payment recorded.', payment });
});

// ── POST /api/admin/students/:id/grading ─────────────────────
app.post('/api/admin/students/:id/grading', verifyToken, (req, res) => {
    const { date, result, beltAwarded, notes } = req.body;
    if (!date || !result) return res.status(400).json({ error: 'date and result are required.' });

    const students = readStudents();
    const idx = students.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

    const entry = {
        id:          'grading_' + Date.now(),
        date:        String(date).trim(),
        result:      String(result).trim(),
        beltAwarded: beltAwarded || '',
        notes:       notes || ''
    };

    if (beltAwarded) students[idx].beltLevel = beltAwarded;
    students[idx].gradingHistory = students[idx].gradingHistory || [];
    students[idx].gradingHistory.unshift(entry);
    writeStudents(students);
    writeLog(req, 'RECORD_GRADING', `${students[idx].name} ${result} ${date}`);
    res.json({ message: 'Grading recorded.', entry });
});


// ============================================================
//  FEATURE 9: DYNAMIC SITEMAP.XML
//  Placed BEFORE static middleware so it takes precedence
//  over any static sitemap.xml file.
// ============================================================
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://ifsakarate.com';

app.get('/sitemap.xml', (req, res) => {
    try {
        const now = new Date().toISOString().slice(0, 10);

        // Static pages
        const staticPages = ['', 'about', 'gallery', 'calender', 'pricing', 'documents', 'grading', 'payment', 'sitemap', 'privacy'];
        const urls = staticPages.map(slug => ({
            loc:     `${SITE_BASE_URL}/${slug}`,
            lastmod: now,
            priority: slug === '' ? '1.0' : '0.8'
        }));

        // Dynamic: gallery images grouped by month-year
        try {
            const gallery = JSON.parse(fs.readFileSync(GALLERY_DB, 'utf8'));
            const groups  = {};
            gallery.forEach(img => {
                const key = `${img.month || 'unknown'}-${img.year || '2024'}`;
                if (!groups[key]) groups[key] = img;
            });
            Object.keys(groups).forEach(key => {
                urls.push({ loc: `${SITE_BASE_URL}/gallery#${key.toLowerCase().replace(/\s+/g, '-')}`, lastmod: now, priority: '0.5' });
            });
        } catch (_) {}

        // Dynamic: uploaded documents
        try {
            const docs = JSON.parse(fs.readFileSync(DOC_DB, 'utf8'));
            docs.forEach(doc => {
                urls.push({ loc: `${SITE_BASE_URL}/uploads/document/${encodeURIComponent(doc.filename)}`, lastmod: now, priority: '0.4' });
            });
        } catch (_) {}

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
        res.send(xml);

    } catch (e) {
        console.error('[sitemap] error:', e.message);
        res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});


// ============================================================
//  PHASE 4 — PUSH NOTIFICATIONS (Web Push / VAPID)
// ============================================================

// web-push is an optional dependency; degrade gracefully if absent
let webpush = null;
try {
    webpush = require('web-push');
    const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject    = process.env.VAPID_SUBJECT || 'mailto:admin@ifsa.in';
    if (vapidPublicKey && vapidPrivateKey) {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        console.log('✅ Phase 4: web-push VAPID keys loaded.');
    } else {
        console.warn('⚠️  Phase 4: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set in .env — push disabled.');
        webpush = null;
    }
} catch (e) {
    console.warn('⚠️  Phase 4: web-push not installed (run: npm install web-push). Push disabled.');
    webpush = null;
}

// Data store: subscriptions.json
const SUBSCRIPTIONS_FILE = path.join(DATA_PATH, 'subscriptions.json');
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2));
}

function readSubscriptions() {
    try { return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')); }
    catch (_) { return []; }
}
function writeSubscriptions(data) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
}

// ── GET /api/push/vapid-public-key — public: browser needs this to subscribe ──
app.get('/api/push/vapid-public-key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: 'Push notifications not configured.' });
    res.json({ publicKey: key });
});

// ── POST /api/push/subscribe — save a browser push subscription ──────────────
app.post('/api/push/subscribe', (req, res) => {
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription object.' });

    const subs = readSubscriptions();

    // Get optional studentId from auth cookie (if logged in)
    let studentId = null;
    try {
        const cookieHeader = req.headers.cookie || '';
        const tokenMatch   = cookieHeader.match(/ifsa_student_token=([^;]+)/);
        if (tokenMatch) {
            const decoded = require('jsonwebtoken').verify(tokenMatch[1], STUDENT_JWT_SECRET);
            studentId = decoded.id || null;
        }
    } catch (_) { /* anonymous visitor */ }

    // Deduplicate by endpoint
    const existing = subs.findIndex(s => s.endpoint === sub.endpoint);
    const record = {
        endpoint:   sub.endpoint,
        keys:       sub.keys,
        studentId,
        subscribedAt: new Date().toISOString()
    };
    if (existing > -1) subs[existing] = record;
    else subs.push(record);

    writeSubscriptions(subs);
    res.json({ message: 'Subscribed.', total: subs.length });
});

// ── POST /api/push/unsubscribe — remove a subscription ───────────────────────
app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required.' });
    const subs = readSubscriptions().filter(s => s.endpoint !== endpoint);
    writeSubscriptions(subs);
    res.json({ message: 'Unsubscribed.' });
});

// ── POST /api/push/send — admin: send a push notification ────────────────────
// body: { title, body, url, audience }
// audience: "all" | "student:<studentId>"
app.post('/api/push/send', verifyToken, async (req, res) => {
    if (!webpush) return res.status(503).json({ error: 'Push notifications not configured on this server.' });

    const { title, body: msgBody, url, audience = 'all', icon } = req.body;
    if (!title || !msgBody) return res.status(400).json({ error: 'title and body are required.' });

    let subs = readSubscriptions();

    // Audience targeting
    if (audience && audience !== 'all') {
        if (audience.startsWith('student:')) {
            const sid = audience.replace('student:', '');
            subs = subs.filter(s => s.studentId === sid);
        }
    }

    if (subs.length === 0) return res.json({ message: 'No matching subscribers.', sent: 0, failed: 0 });

    const payload = JSON.stringify({
        title,
        body:  msgBody,
        url:   url  || '/',
        icon:  icon || '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag:   'ifsa-admin-push-' + Date.now()
    });

    let sent = 0, failed = 0;
    const staleEndpoints = [];

    await Promise.all(subs.map(async sub => {
        try {
            await webpush.sendNotification(sub, payload);
            sent++;
        } catch (err) {
            failed++;
            // 404 / 410 = subscription expired → remove it
            if (err.statusCode === 404 || err.statusCode === 410) {
                staleEndpoints.push(sub.endpoint);
            }
            console.error('[push/send] error for', sub.endpoint.slice(-20), ':', err.message);
        }
    }));

    // Clean up stale subscriptions
    if (staleEndpoints.length) {
        const cleaned = readSubscriptions().filter(s => !staleEndpoints.includes(s.endpoint));
        writeSubscriptions(cleaned);
    }

    writeLog(req, 'PUSH_NOTIFICATION', `"${title}" → ${sent} sent, ${failed} failed`);
    res.json({ message: `Notification sent.`, sent, failed, total: subs.length });
});

// ── GET /api/push/stats — admin: subscriber count ────────────────────────────
app.get('/api/push/stats', verifyToken, (req, res) => {
    const subs = readSubscriptions();
    res.json({ total: subs.length, loggedIn: subs.filter(s => s.studentId).length });
});


// ── Serve static frontend files ───────────────────────────────
// MIGRATION: was express.static(path.join(__dirname)) which served this
// entire backend folder (admin.html, data/, etc.) as public static files.
// Now points at the sibling frontend/ folder; admin.html is served
// separately below via its own /admin route (see note there on auth),
// and is NOT part of this static root.
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH, {
    index: 'index.html',
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// ── Admin panel — served by Express ────────────────────────────
// MIGRATION: admin.html now lives in backend/ (not frontend/), so it is
// never reachable as a static file. This explicit route is the only way
// to reach it.
// NOTE ON AUTH: admin.html is self-gating — it ships its own login form
// and the page's JS calls POST /api/admin/login, stores the resulting
// JWT in sessionStorage, then attaches it as an Authorization: Bearer
// header on every subsequent /api/admin/* call (verifyToken protects
// those). Do NOT put verifyToken on this route itself: a plain browser
// navigation to /admin has no Authorization header to send, so the
// login page would 401 before it could even render. The "auth" the
// migration plan refers to for this route is "logged-in admins only
// get past the in-page login form," not a server-side route guard.
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Service Worker ────────────────────────────────────────────
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(FRONTEND_PATH, 'sw.js'));
});

// ── 404 fallback ──────────────────────────────────────────────
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found.' });
    res.status(404).sendFile(path.join(FRONTEND_PATH, '404.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'An internal server error occurred.' });
});


// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 IFSA Server running on port ${PORT}`);
    console.log(`🔒 Security: bcrypt auth (dual admin), JWT sessions, rate limiting, file type validation`);
    console.log(`✨ Phase A: Google Reviews, Achievements, Grading Syllabus, UPI Payments, WhatsApp, Gallery Blur, Sitemap`);
    console.log(`✨ Phase 1: Hero Stats API, Achievement Image Uploads, WA Contacts Import, WA Broadcast Group`);
    console.log(`✨ Plan 2 Phase A: Timetable Slots CRUD, Named Admin Config (admin-config.json), Activity Log 'who' field`);
    console.log(`✨ Phase 4: Push Notifications — /api/push/subscribe, /api/push/send, /api/push/stats`);
    console.log(`⚠️  Remember to set ADMIN1_PASSWORD_HASH, ADMIN2_PASSWORD_HASH, and JWT_SECRET before deploying!`);
});