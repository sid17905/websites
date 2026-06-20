// ============================================================
//  IFSA SEARCH INDEX  — Phase 2
//  Exports window.SEARCH_DATA (array of searchable entries).
//  Static entries are hardcoded; dynamic entries are fetched
//  from the existing API routes and merged in at page-load.
// ============================================================

(function () {
    'use strict';

    // ── Static entries ────────────────────────────────────────
    var STATIC_DATA = [

        // ── Home / Index ──────────────────────────────────────
        { title: 'Home', page: 'index.html', section: 'Home',
          keywords: ['home', 'welcome', 'ifsa', 'karate', 'mumbai', 'academy'],
          snippet: 'Indian Fit Sports Academy — expert karate training in Mumbai since 2008.' },

        { title: 'About IFSA', page: 'about.html', section: 'About',
          keywords: ['about', 'history', 'legacy', 'ifsa', 'founded', '2008'],
          snippet: 'Learn about IFSA\'s legacy, values and story since 2008.' },

        { title: 'Instructors', page: 'about.html#instructors', section: 'About',
          keywords: ['instructor', 'sensei', 'coach', 'teacher', 'staff', 'trainer'],
          snippet: 'Meet our WKF-affiliated expert karate instructors.' },

        { title: 'Affiliations', page: 'about.html', section: 'About',
          keywords: ['wkf', 'akf', 'isko', 'kio', 'affiliation', 'federation'],
          snippet: 'IFSA is affiliated to WKF, AKF, ISKO & KIO.' },

        // ── Programs ──────────────────────────────────────────
        { title: 'Kids Karate Program', page: 'index.html#programs', section: 'Programs',
          keywords: ['kids', 'children', 'junior', 'beginner', 'program', 'class'],
          snippet: 'Karate classes for kids — discipline, fitness and confidence.' },

        { title: 'Adult Karate Program', page: 'index.html#programs', section: 'Programs',
          keywords: ['adult', 'senior', 'advanced', 'program', 'class', 'training'],
          snippet: 'Adult karate training for all levels — beginner to advanced.' },

        { title: 'Self-Defence Program', page: 'index.html#programs', section: 'Programs',
          keywords: ['self defence', 'self-defence', 'defense', 'protection', 'safety'],
          snippet: 'Practical self-defence training for everyday situations.' },

        { title: 'Competitive Karate', page: 'index.html#programs', section: 'Programs',
          keywords: ['competition', 'tournament', 'championship', 'kata', 'kumite'],
          snippet: 'Train for state and national level karate tournaments.' },

        // ── Gallery ───────────────────────────────────────────
        { title: 'Photo Gallery', page: 'gallery.html', section: 'Gallery',
          keywords: ['gallery', 'photos', 'pictures', 'images', 'events'],
          snippet: 'Browse IFSA\'s photo gallery — tournaments, gradings and events.' },

        // ── Schedule / Calendar ───────────────────────────────
        { title: 'Class Schedule', page: 'calender.html', section: 'Schedule',
          keywords: ['schedule', 'timetable', 'calendar', 'timing', 'batch', 'class time'],
          snippet: 'View class timings and batch schedules for all IFSA branches.' },

        { title: 'Morning Batch', page: 'calender.html', section: 'Schedule',
          keywords: ['morning', 'morning batch', '6am', '7am', 'early'],
          snippet: 'Morning training batches — typically 6–8 AM.' },

        { title: 'Evening Batch', page: 'calender.html', section: 'Schedule',
          keywords: ['evening', 'evening batch', '5pm', '6pm', '7pm'],
          snippet: 'Evening training batches — typically 5–7 PM.' },

        // ── Grading ───────────────────────────────────────────
        { title: 'Belt Grading Syllabus', page: 'grading.html', section: 'Grading',
          keywords: ['grading', 'syllabus', 'belt', 'exam', 'test', 'assessment'],
          snippet: 'Complete WKF Shito-Ryu belt grading pathway from White to Black Belt.' },

        { title: 'White Belt (10th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['white belt', '10th kyu', 'beginner belt', 'first belt'],
          snippet: 'Starting rank — white belt requirements and syllabus.' },

        { title: 'Yellow Belt (9th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['yellow belt', '9th kyu'],
          snippet: 'Yellow belt grading requirements — 9th Kyu.' },

        { title: 'Orange Belt (8th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['orange belt', '8th kyu'],
          snippet: 'Orange belt grading requirements — 8th Kyu.' },

        { title: 'Green Belt (7th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['green belt', '7th kyu'],
          snippet: 'Green belt grading requirements — 7th Kyu.' },

        { title: 'Blue Belt (6th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['blue belt', '6th kyu'],
          snippet: 'Blue belt grading requirements — 6th Kyu.' },

        { title: 'Purple Belt (5th Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['purple belt', '5th kyu'],
          snippet: 'Purple belt grading requirements — 5th Kyu.' },

        { title: 'Brown Belt (4th–2nd Kyu)', page: 'grading.html', section: 'Grading',
          keywords: ['brown belt', '4th kyu', '3rd kyu', '2nd kyu', 'shodan'],
          snippet: 'Brown belt grading — 4th, 3rd and 2nd Kyu requirements.' },

        { title: 'Black Belt (1st Dan)', page: 'grading.html', section: 'Grading',
          keywords: ['black belt', '1st dan', 'shodan', 'dan grade'],
          snippet: 'Black belt (Shodan) — the first Dan grade requirements.' },

        { title: 'Kata Syllabus', page: 'grading.html', section: 'Grading',
          keywords: ['kata', 'form', 'pinan', 'heian', 'shito-ryu', 'pattern'],
          snippet: 'Shito-Ryu kata list required for each belt level.' },

        { title: 'Kumite Grading', page: 'grading.html', section: 'Grading',
          keywords: ['kumite', 'sparring', 'fighting', 'combat', 'ippon'],
          snippet: 'Kumite (sparring) requirements for grading assessments.' },

        { title: 'Download Grading Syllabus PDF', page: 'grading.html', section: 'Grading',
          keywords: ['download', 'pdf', 'syllabus pdf', 'grading pdf', 'print'],
          snippet: 'Download the full grading syllabus as a PDF document.' },

        // ── Pricing / Fees ────────────────────────────────────
        { title: 'Fee Structure', page: 'pricing.html', section: 'Pricing',
          keywords: ['fees', 'fee', 'pricing', 'cost', 'price', 'charges', 'rate'],
          snippet: 'View monthly and annual fee structure for all batches.' },

        { title: 'Admission Fee', page: 'pricing.html', section: 'Pricing',
          keywords: ['admission', 'joining fee', 'registration', 'enrol', 'enrollment'],
          snippet: 'One-time admission and registration fees for new students.' },

        { title: 'Monthly Fees', page: 'pricing.html', section: 'Pricing',
          keywords: ['monthly fee', 'monthly', 'per month', 'tuition'],
          snippet: 'Monthly tuition fee for regular karate classes.' },

        { title: 'Join IFSA — Enrol Now', page: 'pricing.html', section: 'Pricing',
          keywords: ['join', 'enrol', 'enroll', 'register', 'trial class', 'free trial'],
          snippet: 'Enrol at IFSA — book a free trial class today.' },

        // ── Documents ─────────────────────────────────────────
        { title: 'Documents & Downloads', page: 'documents.html', section: 'Documents',
          keywords: ['documents', 'downloads', 'forms', 'pdf', 'files', 'materials'],
          snippet: 'Download forms, circulars, and other IFSA documents.' },

        { title: 'Admission Form', page: 'documents.html', section: 'Documents',
          keywords: ['admission form', 'registration form', 'application form', 'form'],
          snippet: 'Download and fill the IFSA student admission form.' },

        // ── Payment ───────────────────────────────────────────
        { title: 'Make a Payment', page: 'payment.html', section: 'Payment',
          keywords: ['payment', 'pay', 'upi', 'fees payment', 'online payment'],
          snippet: 'Pay your IFSA fees online via UPI or bank transfer.' },

        { title: 'UPI Payment', page: 'payment.html', section: 'Payment',
          keywords: ['upi', 'gpay', 'phonepe', 'paytm', 'qr code', 'scan'],
          snippet: 'Pay fees instantly via UPI — scan the QR code or use the UPI ID.' },

        { title: 'Payment Receipt', page: 'payment.html', section: 'Payment',
          keywords: ['receipt', 'screenshot', 'proof', 'confirmation', 'submit payment'],
          snippet: 'Upload your payment screenshot to confirm your fee payment.' },

        // ── Locations ─────────────────────────────────────────
        { title: 'IFSA Branches', page: 'index.html#contact', section: 'Locations',
          keywords: ['location', 'branch', 'centre', 'address', 'andheri', 'borivali', 'where'],
          snippet: 'Find IFSA karate training centres across Mumbai.' },

        { title: 'Contact IFSA', page: 'index.html#contact', section: 'Contact',
          keywords: ['contact', 'phone', 'email', 'whatsapp', 'reach', 'enquiry', 'call'],
          snippet: 'Get in touch — call, WhatsApp or email IFSA.' },

    ];

    // ── Expose globally ───────────────────────────────────────
    window.SEARCH_DATA = STATIC_DATA.slice(); // start with static

    // ── Merge dynamic entries from API ────────────────────────
    var BASE = (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '');

    // 1. Documents from /api/documents/list
    fetch(BASE + '/api/documents/list')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (docs) {
            if (!Array.isArray(docs)) return;
            docs.forEach(function (doc) {
                if (!doc.filename && !doc.name) return;
                var name = doc.name || doc.filename || '';
                window.SEARCH_DATA.push({
                    title:    name,
                    page:     'documents.html',
                    section:  'Documents',
                    keywords: ['document', 'download', 'pdf', name.toLowerCase()],
                    snippet:  'Uploaded document — ' + name + '. Available on the Documents page.',
                    dynamic:  true
                });
            });
        })
        .catch(function () {});

    // 2. Locations from /api/locations
    fetch(BASE + '/api/locations')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (locs) {
            if (!Array.isArray(locs)) return;
            locs.forEach(function (loc) {
                var name = loc.name || loc.title || '';
                var area = loc.area || loc.address || '';
                if (!name) return;
                window.SEARCH_DATA.push({
                    title:    name + (area ? ' — ' + area : ''),
                    page:     'index.html#contact',
                    section:  'Locations',
                    keywords: ['branch', 'location', 'centre', name.toLowerCase(), area.toLowerCase()],
                    snippet:  'IFSA training centre at ' + (area || name) + '.',
                    dynamic:  true
                });
            });
        })
        .catch(function () {});

    // 3. Timetable slots from /api/timetable
    fetch(BASE + '/api/timetable')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (slots) {
            if (!Array.isArray(slots)) return;
            slots.forEach(function (slot) {
                var day  = slot.day  || slot.dayOfWeek || '';
                var time = slot.time || slot.slot      || slot.timeSlot || '';
                var loc  = slot.location || slot.branch || slot.centre || '';
                if (!day && !time) return;
                var title = [day, time, loc].filter(Boolean).join(' · ');
                window.SEARCH_DATA.push({
                    title:    title,
                    page:     'calender.html',
                    section:  'Schedule',
                    keywords: ['schedule', 'timetable', day.toLowerCase(), time.toLowerCase(), loc.toLowerCase()],
                    snippet:  'Class: ' + title,
                    dynamic:  true
                });
            });
        })
        .catch(function () {});

})();