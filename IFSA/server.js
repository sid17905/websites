const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json()); 

// --- PATH SETUP ---
// Define all paths in one place to avoid confusion
const ROOT_UPLOAD_PATH = path.join(__dirname, 'uploads');
const SLIDESHOW_PATH = path.join(ROOT_UPLOAD_PATH, 'slideshow');
const GALLERY_PATH = path.join(ROOT_UPLOAD_PATH, 'gallery');
const DOCUMENT_PATH = path.join(ROOT_UPLOAD_PATH, 'document');
const DATA_PATH = path.join(__dirname, 'data');

const BOOKING_FILE = path.join(__dirname, 'bookings.xlsx');

// Data Files
const GALLERY_DB = path.join(__dirname, 'gallery-data.json');
const DOC_DB = path.join(__dirname, 'document-data.json');
const SCHEDULE_DB = path.join(__dirname, 'schedule-data.json');
const ANNOUNCE_DB = path.join(__dirname, 'announcement-data.json'); 
const LOCATIONS_FILE = path.join(DATA_PATH, 'locations.json');
const INSTRUCTORS_FILE = path.join(DATA_PATH, 'instructors.json');

// 1. Ensure Folders Exist
[ROOT_UPLOAD_PATH, SLIDESHOW_PATH, GALLERY_PATH, DOCUMENT_PATH, DATA_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 2. Ensure Data Files Exist
[GALLERY_DB, DOC_DB, SCHEDULE_DB, ANNOUNCE_DB, LOCATIONS_FILE, INSTRUCTORS_FILE].forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]));
});

// 3. STATIC FOLDERS (This lets the browser see images)
app.use('/uploads', express.static(ROOT_UPLOAD_PATH));


// --- MULTER STORAGE ENGINE (Fixes "No Image" issue) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (req.originalUrl.includes('slideshow')) cb(null, SLIDESHOW_PATH);
        else if (req.originalUrl.includes('gallery')) cb(null, GALLERY_PATH);
        else if (req.originalUrl.includes('documents')) cb(null, DOCUMENT_PATH);
        else cb(null, ROOT_UPLOAD_PATH); // Instructors go here
    },
    filename: (req, file, cb) => {
        // Adds proper extension (.jpg, .png) so browser can read it
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// --- API ROUTES ---

// 1. SLIDESHOW
app.get('/api/slideshow/images', (req, res) => {
    fs.readdir(SLIDESHOW_PATH, (err, files) => {
        if (err) return res.send([]);
        const valid = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).reverse();
        res.send(valid.map(f => `http://localhost:3000/uploads/slideshow/${f}`));
    });
});
app.post('/api/slideshow/upload', upload.array('images'), (req, res) => res.send({ msg: 'OK' }));
app.delete('/api/slideshow/images/:name', (req, res) => {
    fs.unlink(path.join(SLIDESHOW_PATH, req.params.name), () => res.send({ msg: 'Deleted' }));
});

// 2. GALLERY
app.get('/api/gallery/images', (req, res) => {
    const db = JSON.parse(fs.readFileSync(GALLERY_DB));
    res.send(db.map(e => ({ ...e, url: `http://localhost:3000/uploads/gallery/${e.filename}` })));
});
app.post('/api/gallery/upload', upload.array('images'), (req, res) => {
    const { month, year } = req.body;
    const newEntries = req.files.map(f => ({ filename: f.filename, month, year }));
    const db = JSON.parse(fs.readFileSync(GALLERY_DB));
    fs.writeFileSync(GALLERY_DB, JSON.stringify([...newEntries, ...db], null, 2));
    res.send({ msg: 'OK' });
});
app.delete('/api/gallery/images/:name', (req, res) => {
    fs.unlink(path.join(GALLERY_PATH, req.params.name), () => {});
    const db = JSON.parse(fs.readFileSync(GALLERY_DB)).filter(e => e.filename !== req.params.name);
    fs.writeFileSync(GALLERY_DB, JSON.stringify(db, null, 2));
    res.send({ msg: 'Deleted' });
});

// 3. DOCUMENTS
app.get('/api/documents/list', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DOC_DB));
    res.send(db.map(e => ({ ...e, url: `http://localhost:3000/uploads/document/${e.filename}` })));
});
app.post('/api/documents/upload', upload.single('file'), (req, res) => {
    const { title } = req.body; 
    const newDoc = { filename: req.file.filename, title: title || req.file.originalname, date: new Date().toLocaleDateString() };
    const db = JSON.parse(fs.readFileSync(DOC_DB));
    fs.writeFileSync(DOC_DB, JSON.stringify([newDoc, ...db], null, 2));
    res.send({ msg: 'Uploaded' });
});
app.delete('/api/documents/:name', (req, res) => {
    fs.unlink(path.join(DOCUMENT_PATH, req.params.name), () => {});
    const db = JSON.parse(fs.readFileSync(DOC_DB)).filter(e => e.filename !== req.params.name);
    fs.writeFileSync(DOC_DB, JSON.stringify(db, null, 2));
    res.send({ msg: 'Deleted' });
});

// 4. LOCATIONS
app.get('/api/locations', (req, res) => {
    const data = fs.readFileSync(LOCATIONS_FILE);
    res.json(JSON.parse(data));
});
app.post('/api/locations', (req, res) => {
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE));
    locations.push(req.body);
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    res.json({ message: "Saved" });
});
app.delete('/api/locations/:id', (req, res) => {
    let locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE));
    locations = locations.filter(loc => loc.id !== req.params.id);
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    res.json({ message: "Deleted" });
});

// 5. INSTRUCTORS
app.get('/api/instructors', (req, res) => {
    const data = fs.readFileSync(INSTRUCTORS_FILE);
    res.json(JSON.parse(data));
});
app.post('/api/instructors', upload.fields([{ name: 'frontImage' }, { name: 'backImage' }]), (req, res) => {
    const instructors = JSON.parse(fs.readFileSync(INSTRUCTORS_FILE));
    
    const frontPath = req.files['frontImage'] ? '/uploads/' + req.files['frontImage'][0].filename : '';
    const backPath = req.files['backImage'] ? '/uploads/' + req.files['backImage'][0].filename : '';

    const newInstructor = {
        id: Date.now().toString(),
        name: req.body.name,
        role: req.body.role,
        rank: req.body.rank,
        description: req.body.description,
        frontImage: frontPath,
        backImage: backPath
    };

    instructors.push(newInstructor);
    fs.writeFileSync(INSTRUCTORS_FILE, JSON.stringify(instructors, null, 2));
    res.json({ message: "Added" });
});
app.delete('/api/instructors/:id', (req, res) => {
    let instructors = JSON.parse(fs.readFileSync(INSTRUCTORS_FILE));
    instructors = instructors.filter(i => i.id !== req.params.id);
    fs.writeFileSync(INSTRUCTORS_FILE, JSON.stringify(instructors, null, 2));
    res.json({ message: "Deleted" });
});

// 6. SCHEDULE
app.get('/api/schedule/list', (req, res) => res.send(JSON.parse(fs.readFileSync(SCHEDULE_DB))));
app.post('/api/schedule/add', (req, res) => {
    const { title, date, type } = req.body;
    const db = JSON.parse(fs.readFileSync(SCHEDULE_DB));
    const updatedDb = [...db, { id: Date.now(), title, date, type }].sort((a,b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(SCHEDULE_DB, JSON.stringify(updatedDb, null, 2));
    res.send({ msg: 'Added' });
});
app.delete('/api/schedule/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const db = JSON.parse(fs.readFileSync(SCHEDULE_DB));
    fs.writeFileSync(SCHEDULE_DB, JSON.stringify(db.filter(e => e.id !== id), null, 2));
    res.send({ msg: 'Deleted' });
});

// 7. ANNOUNCEMENTS
app.get('/api/announcement/list', (req, res) => res.send(JSON.parse(fs.readFileSync(ANNOUNCE_DB))));
app.post('/api/announcement/add', (req, res) => {
    const { message } = req.body;
    const db = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    const updatedDb = [{ id: Date.now(), message, date: new Date().toLocaleDateString() }, ...db];
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(updatedDb));
    res.send({ msg: 'Added' });
});
app.delete('/api/announcement/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const db = JSON.parse(fs.readFileSync(ANNOUNCE_DB));
    fs.writeFileSync(ANNOUNCE_DB, JSON.stringify(db.filter(e => e.id !== id)));
    res.send({ msg: 'Deleted' });
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log("🚀 Server running on Port 3000"));