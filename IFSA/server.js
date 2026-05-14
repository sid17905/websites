// ============================================================
//  IFSA SERVER — PHASE 1 SECURITY HARDENED
//  Changes from original:
//    1. bcrypt + JWT authentication (replaces plain-text check)
//    2. express-rate-limit on login endpoint
//    3. Server-side Multer fileFilter (whitelist by MIME type)
//    4. verifyToken middleware protecting all write/delete routes
//    5. Helmet HTTP security headers
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
const sharp         = require('sharp'); // Task 2.3 — image compression

const app = express();

// ── Security headers (manual, avoids needing helmet package) ──
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(cors());
app.use(express.json());


// ============================================================
//  SECURITY CONFIG
//  ⚠️  CHANGE JWT_SECRET to a long random string in production!
//  Generate one with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// ============================================================
const JWT_SECRET      = process.env.JWT_SECRET || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_IN_PRODUCTION';
const TOKEN_EXPIRY    = '8h';   // Session expires after 8 hours

// ── Hashed admin password ────────────────────────────────────
// This is the bcrypt hash of your password.
// To change the password:
//   1. Run: node -e "require('bcrypt').hash('YOUR_NEW_PASSWORD', 12).then(console.log)"
//   2. Paste the output hash here and restart the server.
//
// Default password: admin123  (CHANGE THIS BEFORE GOING LIVE!)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ||
    '$2b$12$ZmQLZDZkwGQqv4vke4kHg.hSF2GyZp8mzoa5lx2Z3R6XQ/8.g6YN6';
// ↑ Hash of "admin123". Replace with your own hash.


// ============================================================
//  RATE LIMITER  (Task 1.2)
//  Max 5 login attempts per 15 minutes per IP
// ============================================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 5,
    message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
});


// ============================================================
//  JWT MIDDLEWARE  (Task 1.1)
//  Protects all write/delete API routes
// ============================================================
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please log in.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Session expired. Please log in again.' });
        }
        req.user = user;
        next();
    });
}


// ============================================================
//  ACTIVITY LOG HELPER  (Task 6.3)
//  Appended to admin-log.json on every write/delete operation.
//  Log entry: { timestamp, action, item, ip }
// ============================================================
function writeLog(req, action, item) {
    try {
        const log = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
        log.unshift({
            timestamp: new Date().toISOString(),
            action,
            item: String(item || '').slice(0, 120),  // cap length
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
        });
        // Keep only the last 200 entries
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(log.slice(0, 200), null, 2));
    } catch (e) {
        console.error('[activity log] write error:', e.message);
    }
}


// ============================================================
//  FILE TYPE VALIDATION  (Task 1.3 — expanded)
//  Whitelist by MIME type — not just file extension.
//  Added: HEIC/HEIF (iPhone photos), MKV, MOV, AVI, TIFF, BMP
//  Note: HEIC files are auto-converted to WebP by Sharp on upload,
//  so they display correctly in all browsers.
// ============================================================
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',          // iPhone photos (newer iPhones)
    'image/heif',          // iPhone photos (alternate MIME)
    'image/tiff',          // High-quality camera exports
    'image/bmp',           // Bitmap images
];
const ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/x-matroska',    // MKV — common high-quality format
    'video/mkv',           // MKV alternate MIME (some systems)
    'video/quicktime',     // MOV — iPhone videos
    'video/x-msvideo',     // AVI
    'video/avi',           // AVI alternate MIME
];
const ALLOWED_DOC_TYPES   = ['application/pdf'];

const fileFilter = (req, file, cb) => {
    const url = req.originalUrl;

    // Documents endpoint — PDFs only
    if (url.includes('documents')) {
        if (ALLOWED_DOC_TYPES.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only PDF files are allowed for documents.'), false);
    }

    // Gallery — images + video
    if (url.includes('gallery')) {
        if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Only images (JPG, PNG, WebP, HEIC, TIFF) and videos (MP4, WebM, MKV, MOV, AVI) are allowed.'), false);
    }

    // Slideshow + instructor photos — images only
    if ([...ALLOWED_IMAGE_TYPES].includes(file.mimetype)) return cb(null, true);

    return cb(new Error('Invalid file type. Only images are allowed (JPG, PNG, WebP, HEIC).'), false);
};


// ── PATH SETUP ───────────────────────────────────────────────
const ROOT_UPLOAD_PATH  = path.join(__dirname, 'uploads');
const SLIDESHOW_PATH    = path.join(ROOT_UPLOAD_PATH, 'slideshow');
const GALLERY_PATH      = path.join(ROOT_UPLOAD_PATH, 'gallery');
const DOCUMENT_PATH     = path.join(ROOT_UPLOAD_PATH, 'document');
const DATA_PATH         = path.join(__dirname, 'data');

const BOOKING_FILE      = path.join(__dirname, 'bookings.xlsx');

const GALLERY_DB       = path.join(__dirname, 'gallery-data.json');
const DOC_DB           = path.join(__dirname, 'document-data.json');
const SCHEDULE_DB      = path.join(__dirname, 'schedule-data.json');
const ANNOUNCE_DB      = path.join(__dirname, 'announcement-data.json');
const LOCATIONS_FILE   = path.join(DATA_PATH, 'locations.json');
const INSTRUCTORS_FILE = path.join(DATA_PATH, 'instructors.json');
const TESTIMONIALS_FILE= path.join(DATA_PATH, 'testimonials.json');  // Phase 3.4
const TIMETABLE_FILE   = path.join(DATA_PATH, 'timetable.json');     // Phase 3.5
const HERO_VIDEO_FILE  = path.join(DATA_PATH, 'hero-video.json');    // Phase 4.3
const SITE_DATA_FILE   = path.join(DATA_PATH, 'site-data.json');      // Responsive hero videos + program images
const HERO_VIDEO_PATH  = path.join(ROOT_UPLOAD_PATH, 'hero-video');
const SLIDESHOW_ORDER_FILE = path.join(DATA_PATH, 'slideshow-order.json');  // Phase 6.1
const ACTIVITY_LOG_FILE    = path.join(__dirname, 'admin-log.json');         // Phase 6.3

// Ensure folders exist
[ROOT_UPLOAD_PATH, SLIDESHOW_PATH, GALLERY_PATH, DOCUMENT_PATH, DATA_PATH, HERO_VIDEO_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Ensure data files exist
[GALLERY_DB, DOC_DB, SCHEDULE_DB, ANNOUNCE_DB, LOCATIONS_FILE, INSTRUCTORS_FILE, TESTIMONIALS_FILE, TIMETABLE_FILE, HERO_VIDEO_FILE, SLIDESHOW_ORDER_FILE, ACTIVITY_LOG_FILE, SITE_DATA_FILE].forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify((file === HERO_VIDEO_FILE || file === SITE_DATA_FILE) ? {} : []));
});

// Static file serving
app.use('/uploads', express.static(ROOT_UPLOAD_PATH));


// ── MULTER STORAGE ───────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (req.originalUrl.includes('slideshow')) cb(null, SLIDESHOW_PATH);
        else if (req.originalUrl.includes('gallery'))   cb(null, GALLERY_PATH);
        else if (req.originalUrl.includes('documents')) cb(null, DOCUMENT_PATH);
        else cb(null, ROOT_UPLOAD_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

// upload now uses fileFilter — invalid types are rejected before saving
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB max per file (supports large MKV/MOV)
});

// Global multer error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message.includes('allowed')) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

// ============================================================
//  IMAGE COMPRESSION HELPER  (Task 2.3 — expanded)
//  Converts any uploaded image to WebP, max 4000px wide,
//  quality 90. Replaces the original file in-place.
//  Now handles: HEIC/HEIF (iPhone), TIFF, BMP in addition to
//  the original JPG/PNG/WebP/GIF.
//  Note: Sharp natively reads HEIC via libvips — no extra
//  package needed as long as sharp >= 0.33 is installed.
// ============================================================
const COMPRESSIBLE_IMAGE_EXTS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.heic', '.heif',   // iPhone photos
    '.tiff', '.tif',    // High-quality camera exports
    '.bmp',             // Bitmap
];

async function compressImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    // Only compress images (not PDFs or videos)
    if (!COMPRESSIBLE_IMAGE_EXTS.includes(ext)) return;

    const tempPath = filePath + '.tmp.webp';
    const finalPath = filePath.replace(/\.[^.]+$/, '.webp');
    try {
        await sharp(filePath)
            .resize({ width: 4000, withoutEnlargement: true })  // up to 4K wide, no upscale
            .webp({ quality: 90 })                               // higher quality (was 80)
            .toFile(tempPath);

        fs.unlinkSync(filePath);           // delete original (including .heic etc.)
        fs.renameSync(tempPath, finalPath); // rename to .webp
    } catch (err) {
        console.error('Image compression failed:', err.message);
        // If compression fails, keep original — don't crash the upload
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
}


// ============================================================
//  AUTH ROUTES  (Task 1.1 + 1.2)
// ============================================================

// POST /api/admin/login
// Rate-limited to 5 attempts per 15 min
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
    }

    try {
        const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

        if (!match) {
            // Generic message — don't reveal whether user/pass is wrong
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        res.json({ token, expiresIn: TOKEN_EXPIRY });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// POST /api/admin/verify  — lets the frontend check if token is still valid
app.post('/api/admin/verify', verifyToken, (req, res) => {
    res.json({ valid: true });
});


// ============================================================
//  ALL EXISTING API ROUTES (unchanged logic, write routes now
//  protected with verifyToken middleware)
// ============================================================

// ── 1. SLIDESHOW ─────────────────────────────────────────────
// Public READ, protected WRITE/DELETE
app.get('/api/slideshow/images', (req, res) => {
    fs.readdir(SLIDESHOW_PATH, (err, files) => {
        if (err) return res.send([]);
        const valid = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        // Phase 6.1 — apply saved order if it exists
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
            } else {
                valid.reverse(); // default: newest first
            }
        } catch (_) { valid.reverse(); }
        res.send(valid.map(f => `/uploads/slideshow/${f}`));
    });
});

app.post('/api/slideshow/upload', verifyToken, upload.array('images'), async (req, res) => {
    // Compress each uploaded image (Task 2.3)
    await Promise.all(req.files.map(f => compressImage(f.path)));
    writeLog(req, 'UPLOAD_SLIDESHOW', req.files.map(f=>f.originalname).join(', '));
    res.send({ msg: 'OK' });
});

app.delete('/api/slideshow/images/:name', verifyToken, (req, res) => {
    // Prevent path traversal — strip directory components
    const safeName = path.basename(req.params.name);
    fs.unlink(path.join(SLIDESHOW_PATH, safeName), () => res.send({ msg: 'Deleted' }));
    writeLog(req, 'DELETE_SLIDESHOW', safeName);
});

// PATCH /api/slideshow/reorder — save new display order (Task 6.1)
// Body: { order: ['file1.webp', 'file2.webp', ...] }
app.patch('/api/slideshow/reorder', verifyToken, (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    const safeOrder = order.map(name => path.basename(String(name)));
    fs.writeFileSync(SLIDESHOW_ORDER_FILE, JSON.stringify(safeOrder, null, 2));
    writeLog(req, 'REORDER_SLIDESHOW', `${safeOrder.length} slides`);
    res.json({ message: 'Order saved.' });
});


// ── Phase 4.3 — HERO VIDEO ──────────────────────────────────
// GET /api/hero-video → returns { url } or {} if not set
app.get('/api/hero-video', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(HERO_VIDEO_FILE, 'utf8'));
        if (data && data.filename) {
            res.json({ url: `/uploads/hero-video/${data.filename}` });
        } else {
            res.json({});
        }
    } catch(e) { res.json({}); }
});

// POST /api/hero-video/upload → upload a new hero video (admin only)
app.post('/api/hero-video/upload', verifyToken, (req, res, next) => {
    const heroUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, HERO_VIDEO_PATH),
            filename:    (req, file, cb) => cb(null, 'hero' + path.extname(file.originalname).toLowerCase()),
        }),
        fileFilter: (req, file, cb) => {
            const allowed = [
                'video/mp4',
                'video/webm',
                'video/quicktime',      // MOV — iPhone videos
                'video/x-matroska',     // MKV
                'video/mkv',
            ];
            if (allowed.includes(file.mimetype)) cb(null, true);
            else cb(new Error('Only MP4, WebM, MOV, and MKV videos allowed for hero background.'));
        },
        limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    }).single('video');
    heroUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
        const record = { filename: req.file.filename, uploadedAt: new Date().toISOString() };
        fs.writeFileSync(HERO_VIDEO_FILE, JSON.stringify(record));
        res.json({ message: 'Hero video uploaded.', url: `/uploads/hero-video/${req.file.filename}` });
    });
});

// DELETE /api/hero-video → remove the hero video
app.delete('/api/hero-video', verifyToken, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(HERO_VIDEO_FILE, 'utf8'));
        if (data && data.filename) {
            const filePath = path.join(HERO_VIDEO_PATH, path.basename(data.filename));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        fs.writeFileSync(HERO_VIDEO_FILE, JSON.stringify({}));
        res.json({ message: 'Hero video removed.' });
    } catch(e) { res.status(500).json({ error: 'Failed to remove hero video.' }); }
});


// ── 2. GALLERY ───────────────────────────────────────────────
app.get('/api/gallery/images', (req, res) => {
    const db = JSON.parse(fs.readFileSync(GALLERY_DB));
    res.send(db.map(e => ({ ...e, url: `/uploads/gallery/${e.filename}` })));
});

app.post('/api/gallery/upload', verifyToken, upload.array('images'), async (req, res) => {
    const { month, year, altText } = req.body;   // Task 6.5 — alt text
    // Compress each uploaded image (Task 2.3)
    await Promise.all(req.files.map(f => compressImage(f.path)));
    const newEntries = req.files.map(f => ({ filename: f.filename, month, year, alt: altText || '' }));
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
        title: title || req.file.originalname,
        date: new Date().toLocaleDateString()
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
        id: Date.now().toString(),
        name: req.body.name,
        role: req.body.role,
        rank: req.body.rank,
        description: req.body.description,
        frontImage: frontPath,
        backImage: backPath
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
    // Task 6.2 — filter out expired announcements
    const now  = new Date();
    const all  = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const live = all.filter(a => {
        if (!a.expires_on) return true;           // no expiry = permanent
        return new Date(a.expires_on) >= now;     // keep if not yet expired
    });
    res.send(live);
});

app.post('/api/announcement/add', verifyToken, (req, res) => {
    const { message, expires_on } = req.body;                // Task 6.2 — accept expiry date
    const db = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const entry = {
        id: Date.now(),
        message,
        date: new Date().toLocaleDateString(),
        expires_on: expires_on || null                        // null = no expiry
    };
    const updatedDb = [entry, ...db];
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(updatedDb));
    writeLog(req, 'ADD_ANNOUNCEMENT', message.slice(0, 60));  // Task 6.3
    res.send({ msg: 'Added' });
});

app.delete('/api/announcement/:id', verifyToken, (req, res) => {
    const id = parseInt(req.params.id);
    const db = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const item = db.find(e => e.id === id);
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(db.filter(e => e.id !== id)));
    writeLog(req, 'DELETE_ANNOUNCEMENT', item ? item.message.slice(0, 60) : id); // Task 6.3
    res.send({ msg: 'Deleted' });
});


// ============================================================
//  PHASE 3 — NEW ROUTES
// ============================================================

// ── 8. TRIAL BOOKINGS  (Task 3.2 + 3.3) ─────────────────────
const BOOKING_DB = path.join(__dirname, 'bookings-data.json');
if (!fs.existsSync(BOOKING_DB)) fs.writeFileSync(BOOKING_DB, JSON.stringify([]));

app.get('/api/bookings/list', verifyToken, (req, res) => {
    res.json(JSON.parse(fs.readFileSync(BOOKING_DB)));
});

app.post('/api/bookings/add', (req, res) => {
    const { name, phone, email, branch, course, session, age, message } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
    const booking = {
        id: Date.now().toString(),
        name, phone, email: email || '',
        branch: branch || '', course: course || '',
        session: session || '', age: age || '',
        message: message || '',
        status: 'Pending',
        createdAt: new Date().toLocaleDateString('en-IN')
    };
    const db = JSON.parse(fs.readFileSync(BOOKING_DB));
    db.unshift(booking);
    fs.writeFileSync(BOOKING_DB, JSON.stringify(db, null, 2));
    res.json({ message: 'Booking received!' });
});

app.patch('/api/bookings/:id/status', verifyToken, (req, res) => {
    const { status } = req.body;
    const db = JSON.parse(fs.readFileSync(BOOKING_DB));
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

// ── 9. TESTIMONIALS  (Task 3.4) ──────────────────────────────
app.get('/api/testimonials', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(TESTIMONIALS_FILE)));
});

app.post('/api/testimonials', verifyToken, upload.single('photo'), (req, res) => {
    const { name, belt, quote } = req.body;
    const photo = req.file ? '/uploads/' + req.file.filename : '';
    const db = JSON.parse(fs.readFileSync(TESTIMONIALS_FILE));
    db.unshift({ id: Date.now().toString(), name, belt, quote, photo });
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Added' });
});

app.delete('/api/testimonials/:id', verifyToken, (req, res) => {
    const db = JSON.parse(fs.readFileSync(TESTIMONIALS_FILE)).filter(t => t.id !== req.params.id);
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Deleted' });
});

// ── 10. TIMETABLE  (Task 3.5) ────────────────────────────────
app.get('/api/timetable', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(TIMETABLE_FILE)));
});

app.post('/api/timetable', verifyToken, (req, res) => {
    const { day, slot, batch, time, instructor } = req.body;
    const db = JSON.parse(fs.readFileSync(TIMETABLE_FILE));
    // Remove existing entry for same day+slot if exists
    const filtered = db.filter(e => !(e.day === day && e.slot === slot));
    filtered.push({ id: Date.now().toString(), day, slot, batch, time, instructor });
    fs.writeFileSync(TIMETABLE_FILE, JSON.stringify(filtered, null, 2));
    res.json({ message: 'Saved' });
});

app.delete('/api/timetable/:id', verifyToken, (req, res) => {
    const db = JSON.parse(fs.readFileSync(TIMETABLE_FILE)).filter(e => e.id !== req.params.id);
    fs.writeFileSync(TIMETABLE_FILE, JSON.stringify(db, null, 2));
    res.json({ message: 'Deleted' });
});


// ── ADMIN ACTIVITY LOG  (Task 6.3) ───────────────────────────
// GET /api/admin/log  — returns last 20 log entries (admin only)
app.get('/api/admin/log', verifyToken, (req, res) => {
    try {
        const log = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
        res.json(log.slice(0, 20));
    } catch (e) {
        res.json([]);
    }
});

// ============================================================
//  RESPONSIVE HERO VIDEOS  (desktop + mobile)
//  GET  /api/hero-videos        → { desktop, mobile }
//  POST /api/hero-videos        → upload desktop/mobile video
//  DELETE /api/hero-videos/:slot → remove desktop or mobile
// ============================================================
function readSiteData() {
    try { return JSON.parse(fs.readFileSync(SITE_DATA_FILE, 'utf8')); }
    catch (_) { return { heroVideos: {}, programImages: {} }; }
}
function writeSiteData(data) {
    fs.writeFileSync(SITE_DATA_FILE, JSON.stringify(data, null, 2));
}

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
                ['.mp4', '.webm'].forEach(e => { try { fs.unlinkSync(path.join(HERO_VIDEO_PATH, 'hero-' + slot + e)); } catch(_){} });
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
    const src = data.heroVideos && data.heroVideos[slot];
    if (src) {
        try { fs.unlinkSync(path.join(__dirname, src)); } catch(_) {}
        delete data.heroVideos[slot];
        writeSiteData(data);
    }
    writeLog(req, 'DELETE_HERO_VIDEO', slot);
    res.json({ success: true });
});


// ============================================================
//  PROGRAM CARD IMAGES  — admin-uploadable per-card images
//  GET  /api/program-images          → { 'kids-karate': '/uploads/...' }
//  POST /api/program-images/:id      → upload image for one card
//  DELETE /api/program-images/:id    → remove image for one card
// ============================================================
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
        // Compress to webp
        await compressImage(req.file.path);
        // After compression the file is .webp
        const webpPath = req.file.path.replace(/\.[^.]+$/, '.webp');
        const finalName = 'program-' + id + '.webp';
        const finalPath = path.join(ROOT_UPLOAD_PATH, finalName);
        // Remove old versions
        ['.jpg','.jpeg','.png','.webp','.gif'].forEach(e => {
            try { fs.unlinkSync(path.join(ROOT_UPLOAD_PATH, 'program-' + id + e)); } catch(_) {}
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
    const id = req.params.id;
    if (!VALID_PROGRAM_IDS.includes(id)) return res.status(400).json({ error: 'Unknown program id' });
    const data = readSiteData();
    const src = data.programImages && data.programImages[id];
    if (src) {
        try { fs.unlinkSync(path.join(__dirname, src)); } catch(_) {}
        delete data.programImages[id];
        writeSiteData(data);
    }
    writeLog(req, 'DELETE_PROGRAM_IMAGE', id);
    res.json({ success: true });
});


// ── Serve static files (HTML, CSS, JS, images) ───────────────
// This makes sure index.html, about.html etc. are all served.
app.use(express.static(path.join(__dirname), {
    index: 'index.html',
    // Cache static assets for 1 day (adjust as needed)
    maxAge: '1d',
    // Don't cache HTML files so updates deploy immediately
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// ── Service Worker — served with no-cache so updates propagate ─
// (Task 3.7 — PWA)
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// ── 404 fallback — serve branded 404 page (Task 3.6) ─────────
// Must be LAST route before the error handler.
app.use((req, res) => {
    // Return JSON 404 for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found.' });
    }
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'An internal server error occurred.' });
});


// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 IFSA Server running on port ${PORT}`);
    console.log(`🔒 Security: bcrypt auth, JWT sessions, rate limiting, file type validation`);
    console.log(`⚠️  Remember to change the admin password hash and JWT_SECRET before deploying!`);
});