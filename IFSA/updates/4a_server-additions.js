// ═══════════════════════════════════════════════════════════════
// PATCH 4a — server.js ADDITIONS
// Add these routes to your existing server.js.
// Place them alongside your existing /api/gallery routes.
// Requires: existing multer + express setup already in place.
// ═══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

// ── Storage file for hero videos & program images ──────────────
// Uses a simple JSON file for persistence (no DB needed).
const DATA_FILE = path.join(__dirname, 'site-data.json');

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return { heroVideos: {}, programImages: {} }; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────
// HERO VIDEOS — GET + POST
// GET  /api/hero-videos        → { desktop: '...', mobile: '...' }
// POST /api/hero-videos        → upload desktop and/or mobile video
// ─────────────────────────────────────────────────────────────
const videoUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },   // 200 MB max per video
  fileFilter: (req, file, cb) => {
    cb(null, /video\/(mp4|webm)/.test(file.mimetype));
  }
}).fields([
  { name: 'desktopVideo', maxCount: 1 },
  { name: 'mobileVideo',  maxCount: 1 }
]);

app.get('/api/hero-videos', (req, res) => {
  const data = readData();
  res.json(data.heroVideos || {});
});

app.post('/api/hero-videos', checkAdminAuth, (req, res) => {
  videoUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const data = readData();
    data.heroVideos = data.heroVideos || {};

    if (req.files?.desktopVideo?.[0]) {
      const f = req.files.desktopVideo[0];
      const ext  = f.mimetype === 'video/webm' ? '.webm' : '.mp4';
      const dest = path.join('uploads', `hero-desktop${ext}`);
      // Remove old file if different extension
      ['.mp4', '.webm'].forEach(e => { try { fs.unlinkSync(path.join('uploads', `hero-desktop${e}`)); } catch(_){} });
      fs.renameSync(f.path, dest);
      data.heroVideos.desktop = `/uploads/hero-desktop${ext}`;
    }

    if (req.files?.mobileVideo?.[0]) {
      const f = req.files.mobileVideo[0];
      const ext  = f.mimetype === 'video/webm' ? '.webm' : '.mp4';
      const dest = path.join('uploads', `hero-mobile${ext}`);
      ['.mp4', '.webm'].forEach(e => { try { fs.unlinkSync(path.join('uploads', `hero-mobile${e}`)); } catch(_){} });
      fs.renameSync(f.path, dest);
      data.heroVideos.mobile = `/uploads/hero-mobile${ext}`;
    }

    writeData(data);
    res.json({ success: true, heroVideos: data.heroVideos });
  });
});

// DELETE a specific hero video slot
app.delete('/api/hero-videos/:slot', checkAdminAuth, (req, res) => {
  const slot = req.params.slot;   // 'desktop' or 'mobile'
  if (!['desktop', 'mobile'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  const data = readData();
  const src = data.heroVideos?.[slot];
  if (src) {
    try { fs.unlinkSync(path.join(__dirname, src)); } catch(_) {}
    delete data.heroVideos[slot];
    writeData(data);
  }
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// PROGRAM IMAGES — GET + POST
// GET  /api/program-images          → { 'kids-karate': '/uploads/...', ... }
// POST /api/program-images/:id      → upload image for one program card
// DELETE /api/program-images/:id    → remove program image
// ─────────────────────────────────────────────────────────────
const VALID_PROGRAMS = ['kids-karate', 'adult-karate', 'karate-fitness'];

const programImgUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (req, file, cb) => {
    cb(null, /image\/(jpeg|jpg|png|webp|gif)/.test(file.mimetype));
  }
}).single('image');

app.get('/api/program-images', (req, res) => {
  const data = readData();
  res.json(data.programImages || {});
});

app.post('/api/program-images/:id', checkAdminAuth, (req, res) => {
  const id = req.params.id;
  if (!VALID_PROGRAMS.includes(id)) return res.status(400).json({ error: 'Unknown program id' });

  programImgUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    const ext  = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const dest = path.join('uploads', `program-${id}${ext}`);
    // Remove old versions with any extension
    ['.jpg','.jpeg','.png','.webp','.gif'].forEach(e => {
      try { fs.unlinkSync(path.join('uploads', `program-${id}${e}`)); } catch(_) {}
    });
    fs.renameSync(req.file.path, dest);

    const data = readData();
    data.programImages       = data.programImages || {};
    data.programImages[id]   = `/uploads/program-${id}${ext}`;
    writeData(data);

    res.json({ success: true, src: data.programImages[id] });
  });
});

app.delete('/api/program-images/:id', checkAdminAuth, (req, res) => {
  const id = req.params.id;
  if (!VALID_PROGRAMS.includes(id)) return res.status(400).json({ error: 'Unknown program id' });

  const data = readData();
  const src  = data.programImages?.[id];
  if (src) {
    try { fs.unlinkSync(path.join(__dirname, src)); } catch(_) {}
    delete data.programImages[id];
    writeData(data);
  }
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// ENROLL — update existing route to accept 'age'
// If you already have POST /api/enroll, just add age to the
// destructured body:
//
//   const { name, age, phone, program, date } = req.body;
//   // then save age alongside the other fields
// ─────────────────────────────────────────────────────────────
