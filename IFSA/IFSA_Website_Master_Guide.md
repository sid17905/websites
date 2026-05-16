# IFSA Karate Mumbai — Website Master Reference Guide
> **Indian Fit Sports Academy** | ifsaacademy.in  
> Last updated: May 2026 | Covers all phases of the website build

---

## Table of Contents

1. [Website Overview](#1-website-overview)
2. [How the Site Works (Architecture)](#2-how-the-site-works-architecture)
3. [File & Folder Map](#3-file--folder-map)
4. [Admin Panel — How to Operate](#4-admin-panel--how-to-operate)
5. [Common Tasks — Quick Reference](#5-common-tasks--quick-reference)
6. [API Endpoints Reference](#6-api-endpoints-reference)
7. [Data Files Reference](#7-data-files-reference)
8. [Testing the Website](#8-testing-the-website)
9. [Bug Fixes & Known Issues](#9-bug-fixes--known-issues)
10. [Planned Fixes & New Features](#10-planned-fixes--new-features)
11. [Future Roadmap](#11-future-roadmap)
12. [Troubleshooting](#12-troubleshooting)
13. [Security Checklist](#13-security-checklist)

---

## 1. Website Overview

The IFSA website is a full-stack Node.js website with a dark-mode design (navy + amber/gold). It has:

- **7 public pages** + 1 admin panel + 2 system pages (404, offline)
- **Dynamic content** — photos, schedule, instructors, pricing, etc. are all managed from the admin panel with no code changes needed
- **PWA support** — can be installed on phones like an app
- **WhatsApp integration** — announcements can be broadcast via WhatsApp gateway

| Page | File | Purpose |
|------|------|---------|
| Home | `INDEX.html` | Main landing page |
| About | `about.html` | Academy history, affiliations, team |
| Gallery | `gallery.html` | Masonry photo/video gallery |
| Schedule | `calender.html` | Events calendar + timetable |
| Documents | `documents.html` | Downloadable PDFs |
| Pricing | `pricing.html` | Plans + booking form |
| Admin | `admin.html` | Password-protected CMS |
| 404 | `404.html` | Custom error page |
| Offline | `offline.html` | PWA offline fallback |

---

## 2. How the Site Works (Architecture)

```
Browser (visitor)
      │
      ▼
  NGINX (reverse proxy, HTTPS, port 80/443)
      │
      ▼
  Node.js / Express  ←→  JSON files in /data/
  (server.js, port 3000)  ←→  /uploads/ folder
      │
      ▼
  Static HTML files (INDEX.html, about.html, etc.)
```

- The **server** (`server.js`) runs on Node.js and handles all API calls and file uploads
- **All content data** is stored in JSON files inside the `/data/` folder — no database needed
- **Uploaded files** (photos, videos, PDFs) go into `/uploads/`
- The **admin panel** (`admin.html`) talks to the server via API calls using a JWT token
- The **service worker** (`sw.js`) caches the site for offline use

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Auth | bcrypt + JWT (8-hour sessions) |
| File uploads | Multer |
| Image processing | Sharp (auto-compress to WebP) |
| Excel export | ExcelJS |
| Frontend CSS | Tailwind CSS (CDN) + custom STYLE.css |
| PWA | Service Worker + manifest.json |

---

## 3. File & Folder Map

```
project-root/
│
├── INDEX.html              ← Homepage
├── about.html
├── gallery.html
├── calender.html
├── pricing.html
├── documents.html
├── grading.html
├── payment.html
├── admin.html              ← Admin panel (password protected)
├── 404.html
├── offline.html
│
├── server.js               ← Main backend server (Node.js)
├── change-password.js      ← Run on server to change admin password
├── STYLE.css               ← Global custom styles + CSS variables
├── theme.js                ← (Planned) Shared dark/light theme manager
├── cookie-consent.js       ← (Planned) Cookie consent banner
│
├── sw.js                   ← Service worker (PWA caching)
├── manifest.json           ← PWA manifest
├── sitemap.xml             ← Static sitemap for Google
├── robots.txt              ← Crawler rules
│
├── data/                   ← All content stored as JSON
│   ├── locations.json
│   ├── instructors.json
│   ├── testimonials.json
│   ├── timetable.json
│   ├── hero-video.json
│   ├── slideshow-order.json
│   ├── stats.json          ← (Planned) Editable hero stat numbers
│   ├── achievements.json
│   ├── timetable-slots.json  ← (Planned) Custom slot names
│   └── admin-config.json   ← (Planned) Named multi-admin support
│
├── uploads/                ← All uploaded files live here
│   ├── slideshow/
│   ├── gallery/
│   ├── documents/
│   ├── hero/
│   ├── instructors/
│   ├── testimonials/
│   └── achievements/       ← (Planned) Achievement images
│
├── gallery-data.json
├── document-data.json
├── schedule-data.json
├── announcement-data.json
├── admin-log.json
├── bookings-data.json
└── bookings.xlsx           ← Auto-updated Excel export of bookings
```

---

## 4. Admin Panel — How to Operate

### Logging In

1. Open your browser and go to: `ifsaacademy.in/admin.html`
2. Type your admin password and click **Login**
3. You have **8 hours** before the session expires (timer shown top-right)
4. After **5 wrong attempts**, you are locked out for 15 minutes

> ⚠️ The admin panel URL is not linked on the public site — keep it private.

---

### Section-by-Section Guide

#### 🎬 Hero Video
- Upload an MP4/WebM (max 100MB) to show a full-screen video on the homepage
- If no video is uploaded, the photo slideshow plays instead
- Click **Remove Hero Video** to go back to the slideshow

#### 1 — Home Page Slideshow
- Upload JPG/PNG/WebP photos for the scrolling hero background
- **Drag and drop** thumbnails to reorder → click **Save Order**
- Click the trash icon to delete a photo

#### 2 — Gallery
- Upload photos (JPG/PNG/WebP) or videos (MP4/WebM) — max 50MB each
- Always fill in Month, Year, and Alt Text before uploading
- Tick checkboxes + click **Delete Selected** to bulk delete

#### 3 — Documents
- Upload PDF files with a clear title (e.g. "Tournament Registration Form 2025")
- These appear on the public Documents page as downloadable files

#### 4 — Calendar / Schedule
- Add events with: Date, Title, and Type
  - **General** = regular update
  - **Exam** = belt grading
  - **Tournament** = competition
  - **Holiday** = no class days
- Events are colour-coded and sorted automatically by date

#### 5 — Notice Board (Announcements)
- Post a notice with optional expiry date — it disappears automatically on that date
- Leave expiry blank to keep it up permanently
- Use this for: class cancellations, new batches, fee changes

#### 6 — Locations & Pricing
- Add each branch with: Name, Subtitle, Google Maps embed URL, Beginner plan, Advanced plan
- **To edit pricing:** delete the branch and re-add with new prices (no edit button yet)
- Google Maps embed URL: go to Google Maps → Share → Embed a map → copy only the URL inside `src="..."`

#### 7 — Instructors
- Add with: Name, Role, Rank, Front photo (portrait), Back photo (action shot), Bio
- Cards appear on the Homepage and About page with a 3D flip effect

#### 8 — Testimonials
- Add student quotes with: Name, Belt Rank, Quote, Photo (optional)
- These rotate automatically on the homepage every 5 seconds

#### 9 — Timetable
- Add class slots: Day + Time Slot + Batch Name + Display Time + Instructor
- If a slot already exists for that Day + Time, it is replaced
- Delete individual slots from the list below the form

#### 10 — Trial Bookings
- Every form submission from the website appears here
- Update status: **Pending** (yellow) → **Contacted** (blue) → **Enrolled** (green)
- Call Pending leads within 24 hours for best conversion

#### 11 — Activity Log
- Automatic record of all admin actions: what changed, when, and from which IP
- Click **Refresh** to see latest entries
- Read-only — nothing to do here

---

### Things Currently Hardcoded (Require Developer to Change)

These cannot be changed from the admin panel yet — a developer must edit `INDEX.html` directly:

- Hero stats bar (500+ Students, 15+ Years, 50+ Medals, 4 Locations)
- Programs section text (Kids / Adult / Competition)
- Footer contact details (phone, email, address)
- "Why Choose IFSA" section text
- Belt progression timeline descriptions

> **Note:** Stats will become editable once Fix 5 (see Section 10) is implemented.

---

## 5. Common Tasks — Quick Reference

| Task | Steps |
|------|-------|
| Add class photos | Admin → Section 2 (Gallery) → Select files → Set month/year/alt text → Upload |
| Change class fees | Admin → Section 6 → Delete branch → Re-add with new prices |
| Post a notice | Admin → Section 5 → Type message → Set expiry date → Add |
| Add grading event | Admin → Section 4 → Date + Title + Type "Exam" → Add |
| Mark booking as contacted | Admin → Section 10 → Click status badge → Change to Contacted |
| Upload a PDF document | Admin → Section 3 → Select PDF → Type title → Upload |
| Update timetable | Admin → Section 9 → Pick Day + Slot → Enter details → Save Slot |
| Add an instructor | Admin → Section 7 → Fill all fields + upload 2 photos → Add Instructor |
| Change hero video | Admin → Hero Video section → Upload MP4 (max 100MB) |
| Remove hero video | Admin → Hero Video section → Click Remove Hero Video |

---

## 6. API Endpoints Reference

All API routes are on the same server as the website. Admin-only routes require a Bearer token in the `Authorization` header.

### Public Routes (No Auth Needed)

| Method | Endpoint | What it does |
|--------|----------|-------------|
| GET | `/api/slideshow/images` | Returns slideshow photos |
| GET | `/api/hero-video` | Returns current hero video filename |
| GET | `/api/gallery/images` | Returns gallery photos + videos |
| GET | `/api/documents/list` | Returns downloadable PDFs |
| GET | `/api/locations` | Returns all branches + pricing |
| GET | `/api/instructors` | Returns instructor profiles |
| GET | `/api/schedule/list` | Returns calendar events |
| GET | `/api/announcement/list` | Returns active announcements |
| GET | `/api/timetable` | Returns weekly class grid |
| GET | `/api/testimonials` | Returns student testimonials |
| GET | `/api/achievements` | Returns achievements list |
| GET | `/api/stats` | Returns hero stat numbers *(planned)* |
| GET | `/api/timetable-slots` | Returns slot names *(planned)* |
| POST | `/api/bookings/add` | Submits a trial class booking |
| POST | `/api/admin/login` | Admin login, returns JWT |
| POST | `/api/admin/verify` | Verifies existing JWT |

### Admin-Only Routes (JWT Required)

| Method | Endpoint | What it does |
|--------|----------|-------------|
| POST | `/api/slideshow` | Upload slideshow image |
| DELETE | `/api/slideshow/:filename` | Delete a slideshow image |
| PATCH | `/api/slideshow/reorder` | Save new image order |
| POST | `/api/hero-video` | Upload hero video |
| DELETE | `/api/hero-video` | Remove hero video |
| POST | `/api/gallery` | Upload gallery image/video |
| DELETE | `/api/gallery/:filename` | Delete gallery item |
| POST | `/api/documents` | Upload PDF document |
| DELETE | `/api/documents/:filename` | Delete document |
| POST | `/api/locations` | Add a branch location |
| DELETE | `/api/locations/:id` | Delete a location |
| POST | `/api/instructors` | Add instructor |
| DELETE | `/api/instructors/:id` | Delete instructor |
| POST | `/api/schedule` | Add calendar event |
| DELETE | `/api/schedule/:id` | Delete event |
| POST | `/api/announcements` | Post announcement |
| DELETE | `/api/announcements/:id` | Delete announcement |
| POST | `/api/timetable` | Add/update timetable slot |
| DELETE | `/api/timetable/:id` | Delete timetable slot |
| POST | `/api/testimonials` | Add testimonial |
| DELETE | `/api/testimonials/:id` | Delete testimonial |
| POST | `/api/achievements` | Add achievement |
| PUT | `/api/achievements/:id` | Edit achievement |
| DELETE | `/api/achievements/:id` | Delete achievement |
| GET | `/api/bookings` | View all bookings |
| PATCH | `/api/bookings/:id` | Update booking status |
| DELETE | `/api/bookings/:id` | Delete booking |
| GET | `/api/bookings/export` | Download bookings as Excel *(planned)* |
| GET | `/api/admin/log` | View activity log |
| POST | `/api/stats` | Update hero stats *(planned)* |
| POST | `/api/timetable-slots` | Add a custom slot *(planned)* |
| DELETE | `/api/timetable-slots/:index` | Delete a slot *(planned)* |
| POST | `/api/wa-contacts/import` | Import contacts CSV *(planned)* |

---

## 7. Data Files Reference

All data is stored in plain JSON files. If you ever need to manually fix or inspect data, here is what each file contains:

| File | Contents |
|------|---------|
| `gallery-data.json` | Gallery image metadata (filename, month, year, alt text) |
| `document-data.json` | Document metadata (filename, title, date) |
| `schedule-data.json` | Calendar events (date, title, type) |
| `announcement-data.json` | Announcements (text, optional expiry date) |
| `admin-log.json` | Last 200 admin actions |
| `bookings-data.json` | Trial class booking form submissions |
| `bookings.xlsx` | Same bookings as Excel file |
| `data/locations.json` | Branch locations + pricing plans |
| `data/instructors.json` | Instructor profiles |
| `data/testimonials.json` | Student testimonials |
| `data/timetable.json` | Weekly class grid |
| `data/hero-video.json` | Current hero video filename |
| `data/slideshow-order.json` | Custom slideshow order |
| `data/achievements.json` | Achievements/medals list |
| `data/stats.json` | Hero stats numbers *(planned)* |
| `data/timetable-slots.json` | Custom slot names *(planned)* |
| `data/admin-config.json` | Named admin accounts *(planned)* |
| `data/wa-config.json` | WhatsApp gateway config |
| `data/wa-contacts.json` | WhatsApp broadcast contacts |

### Achievement JSON Structure

```json
{
  "id": "ach_1",
  "icon": "🥇",
  "image": "/uploads/achievements/winner.jpg",
  "title": "National Championship Gold",
  "subtitle": "WKF Senior Kata — New Delhi",
  "year": "2024",
  "category": "tournament"
}
```

---

## 8. Testing the Website

### Quick Health Check (Do This After Any Deployment or Change)

Open the website and check each of these:

- [ ] Homepage loads within 3 seconds
- [ ] Preloader animation plays and fades out
- [ ] Hero slideshow or video plays
- [ ] Stats bar numbers count up when scrolled to
- [ ] Locations section shows correct branches and maps
- [ ] Instructors section loads with flip cards
- [ ] Timetable grid is populated
- [ ] Testimonials carousel auto-advances
- [ ] Trial booking form submits (use test data, then delete from admin)
- [ ] Gallery page loads photos
- [ ] Schedule page shows upcoming events
- [ ] Documents page lists PDFs
- [ ] Pricing page shows correct prices
- [ ] WhatsApp FAB (floating button) visible bottom-right on every page
- [ ] Theme toggle works (dark ↔ light)
- [ ] On mobile: hamburger menu opens and closes

### Testing the Admin Panel

1. Go to `/admin.html` and log in
2. Check each section loads without errors
3. Add a test item in each section → verify it appears on the public site
4. Delete the test item → verify it disappears

### Testing the API Directly (for Developers)

Open your browser console or use a tool like Postman/curl:

```bash
# Check if server is running
curl https://ifsaacademy.in/api/locations

# Test a booking submission
curl -X POST https://ifsaacademy.in/api/bookings/add \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","phone":"9999999999","age":"25","session":"morning"}'

# Check admin login (replace YOUR_PASSWORD)
curl -X POST https://ifsaacademy.in/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_PASSWORD"}'
```

### Checking Server Logs (on the server)

```bash
# If running with PM2
pm2 logs ifsa

# If running directly
node server.js

# Check if port 3000 is in use
lsof -i :3000
```

### Performance Testing

Run a Lighthouse audit in Chrome:
1. Open Chrome DevTools (F12)
2. Go to the **Lighthouse** tab
3. Click **Analyze page load**
4. Target scores: Performance > 80, SEO > 90, Accessibility > 80

---

## 9. Bug Fixes & Known Issues

The following bugs are confirmed and fixes have been designed. Status: **pending implementation**.

---

### Bug 1 — Achievements Wall: No Animation (INDEX.html)

**Problem:** Achievements render as a static grid with no animation or image support.

**Fix:** Replace `#achievements-grid` with a Pinterest-style 3-card carousel:
- 3 portrait cards visible: center card scaled up (scale 1.05, full brightness), side cards dimmed (scale 0.92, brightness 0.55)
- Auto-advances every 5 seconds, pauses on hover
- Swipe support on mobile (touchstart/touchend)
- Dot indicators + Prev/Next arrows

**Files to change:** `INDEX.html` (carousel HTML + JS + CSS)

**CSS to add:**
```css
.ach-card-wrap   { transition: transform 0.45s ease, filter 0.45s ease, opacity 0.45s ease; }
.ach-card-center { transform: scale(1.05); filter: brightness(1); z-index: 2; }
.ach-card-side   { transform: scale(0.92); filter: brightness(0.55); opacity: 0.85; }
```

---

### Bug 2 — Testimonials: One Card Appears Multiple Times

**Problem:** `renderTestimonials()` renders ALL testimonial cards every time a slide happens. The carousel track width is not recalculated, causing the visible card to appear duplicated.

**Fix in `INDEX.html`:**
```js
// WRONG (current):
track.innerHTML = tData.map((t, i) => `...card html...`).join('');

// CORRECT (fix):
// Render ONLY tData[tIdx] as a single centered card.
// Arrow buttons call testimonialSlide() → re-render single card.
track.innerHTML = buildCard(tData[tIdx]);
```

**Files to change:** `INDEX.html`

---

### Bug 3 — Achievements Not Editable in Admin (admin.html)

**Problem:** The Add Achievement form HTML exists in `admin.html` but all JavaScript functions are missing — nothing works.

**Fix:** Add these missing JS functions to `admin.html`:

```js
async function loadAchievements() {
  // GET /api/achievements → populate #ach-list
  // Each row: icon | title | year | Edit | Delete buttons
}

async function addAchievement() {
  // POST /api/achievements with form values as multipart/form-data
}

async function deleteAchievement(id) {
  // Confirm dialog → DELETE /api/achievements/:id
}

async function editAchievement(id) {
  // Fill form with existing data → change button to "Update"
  // On submit → PUT /api/achievements/:id
}
```

Also call `loadAchievements()` on page load.

**Files to change:** `admin.html`

---

### Bug 4 — WA Contacts Panel Not Wired (admin.html)

**Problem:** WhatsApp contacts panel HTML exists but all JS is missing.

**Fix:** Add to `admin.html`:

```js
async function loadWaContacts()    { /* GET /api/wa-contacts */ }
async function addWaContact()      { /* POST /api/wa-contacts */ }
async function deleteWaContact(id) { /* DELETE /api/wa-contacts/:id */ }
async function toggleWaContact(id) { /* PATCH /api/wa-contacts/:id/toggle */ }
```

**Files to change:** `admin.html`

---

### Bug 5 — Google Reviews Admin Panel Not Wired (admin.html)

**Problem:** Google Reviews settings panel HTML exists but all JS is missing.

**Fix:** Add to `admin.html`:

```js
async function loadGoogleReviewsAdmin()    { /* GET settings */ }
async function saveGoogleReviewsSettings() { /* POST settings */ }
async function refreshGoogleReviews()      { /* trigger refresh */ }
```

**Files to change:** `admin.html`

---

### Bug 6 — Duplicate Belt Grading Section (INDEX.html)

**Problem:** Two belt sections exist: `#belt-grading-teaser` (has the "View Full Syllabus" button) and `#belt-progression`. The first section is a duplicate and should be removed.

**Fix:**
1. Delete the entire `<section id="belt-grading-teaser">` block from `INDEX.html`
2. Add the "View Full Syllabus" button inside `#belt-progression`, after the "Minimum 5–6 years" line:

```html
<div class="text-center mt-8">
  <a href="grading.html" class="btn-shimmer inline-flex items-center gap-2
    bg-gradient-to-r from-brand-accent to-amber-600 text-black px-8 py-3
    rounded-xl font-bold text-lg hover:scale-105 transition transform
    shadow-[0_0_20px_rgba(251,191,36,0.35)]">
    View Full Syllabus →
  </a>
</div>
```

**Files to change:** `INDEX.html`

---

## 10. Planned Fixes & New Features

These are designed and ready to implement.

---

### Fix A — Editable Hero Stats Bar

**Goal:** Allow admin to change "500+ Students", "15+ Years", etc. without touching code.

**New file:** `data/stats.json`
```json
{
  "years":      { "value": 15, "suffix": "+", "label": "Years" },
  "students":   { "value": 500, "suffix": "+", "label": "Students" },
  "blackBelts": { "value": 50,  "suffix": "+", "label": "Black Belts" },
  "locations":  { "value": 3,   "suffix": "",  "label": "Locations" }
}
```

**Server changes:** Add `GET /api/stats` (public) and `POST /api/stats` (admin).

**INDEX.html change:** On load, fetch `/api/stats` and apply values to counter elements dynamically before the animation runs.

**Admin panel change:** Add a new "📊 Hero Stats" panel with 4 number inputs and a Save button.

**Files to change:** `server.js`, `INDEX.html`, `admin.html`

---

### Fix B — Editable Timetable Slots

**Goal:** Allow admin to add/remove time slots (e.g. "Afternoon 3–5 PM") without code changes.

**New file:** `data/timetable-slots.json`
```json
["Morning (6–8 AM)", "Evening (5–7 PM)"]
```

**Server changes:** Add `GET /api/timetable-slots`, `POST /api/timetable-slots`, `DELETE /api/timetable-slots/:index`.

**Admin panel change:** Add "Manage Slots" sub-panel inside the Timetable section, above the form.

**Files to change:** `server.js`, `admin.html`

---

### Fix C — Named Multi-Admin Login with Activity Tracking

**Goal:** Different admins have their own passwords and names. The activity log shows who did what.

**New file:** `data/admin-config.json`
```json
{
  "admins": [
    { "passwordHash": "<bcrypt hash>", "name": "Sensei Saurabh", "role": "Head Admin" },
    { "passwordHash": "<bcrypt hash>", "name": "Coordinator", "role": "Staff" }
  ]
}
```

**JWT payload change:**
```js
// Current:  { role: 'admin' }
// New:      { role: 'admin', name: 'Sensei Saurabh' }
```

**Activity log change:** Each log entry adds a `who` field.

**Admin panel change:** Activity log shows `👤 WHO` column in purple.

**Files to change:** `server.js`, `admin.html`

---

### Fix D — WhatsApp Broadcast Group Support

**Goal:** When posting an announcement, also send to a WhatsApp broadcast group (not just individual contacts).

**wa-config.json change:**
```json
{
  "broadcastGroupId": "120363XXXXXXXXXX@broadcast",
  "broadcastEnabled": true
}
```

**Server change:** After the personal message loop, send one API call with the group JID.

**CSV import:** Admin can upload a CSV file of phone numbers to bulk-import contacts.

```
name,phone
Rahul Shah,919876543210
Priya Nair,919004383448
```

**Files to change:** `server.js`, `admin.html`

---

### Fix E — Cookie Consent Banner

**Goal:** Legal GDPR compliance before running Google Ads or Analytics.

**New file:** `cookie-consent.js`

- On first visit: shows a bottom bar with "Accept All" / "Essential Only" / "Learn More"
- Saves choice to `localStorage` as `ifsa_cookie_consent`
- Google Analytics only loads after "Accept All" is clicked
- Never shown again after a choice is made

**New page:** `privacy.html` — lists all cookies and their purpose

**Every HTML page change:** Add one line in `<head>`:
```html
<script src="/cookie-consent.js"></script>
```

---

### Fix F — Human-Readable Sitemap Page

**Goal:** A styled `/sitemap.html` page listing all pages, for SEO and navigation.

**New file:** `sitemap.html`

- Sections: Main Pages, Locations (fetched from API), Gallery Albums (from API), Documents (from API)
- Matches IFSA design (dark-mode, Tailwind, amber accents)
- Add "Sitemap" link to footer of every page

---

### Fix G — Dark/Light Mode on All Pages

**Goal:** Every page remembers and applies the theme — no flash of wrong theme on load.

**New file:** `theme.js` — place in project root:
```js
(function () {
  const KEY  = 'ifsa_theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(KEY) || 'dark';
  root.classList.toggle('dark',  saved === 'dark');
  root.classList.toggle('light', saved === 'light');

  window.toggleTheme = function () {
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    root.classList.toggle('dark',  next === 'dark');
    root.classList.toggle('light', next === 'light');
    localStorage.setItem(KEY, next);
    document.querySelectorAll('.theme-icon')
      .forEach(el => { el.textContent = next === 'dark' ? '☀️' : '🌙'; });
  };

  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) {
      root.classList.toggle('dark',  e.newValue === 'dark');
      root.classList.toggle('light', e.newValue === 'light');
    }
  });
})();
```

**Every HTML page:** Add as the FIRST script in `<head>`:
```html
<script src="/theme.js"></script>
```

**Toggle button HTML** (add to every page's navbar):
```html
<button onclick="toggleTheme()" class="theme-toggle-btn"
  aria-label="Toggle dark/light mode" title="Toggle theme">
  <span class="theme-icon">☀️</span>
</button>
```

**Files to change:** `theme.js` (new), all `.html` pages

---

## 11. Future Roadmap

Features planned for future phases, ordered by impact.

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| 🔴 Critical | Deploy HTTPS via nginx | Everything breaks without it | Medium |
| 🔴 Very High | Razorpay online fee payment | Closes the "interested → paying" loop | Medium |
| 🔴 Very High | Student login portal | Transforms site from brochure to utility | Hard |
| 🟠 High | Enquiry form + email notification | Captures leads who won't use WhatsApp | Easy |
| 🟠 High | WhatsApp booking confirmation | Auto-confirms trial bookings | Easy |
| 🟠 High | Google Reviews badge | Live rating from verified source | Easy |
| 🟠 High | Grading syllabus page | SEO win + student resource | Medium |
| 🟡 Medium | Export bookings button | Admin downloads Excel from UI | Easy |
| 🟡 Medium | Booking filter/search | Filter by status/branch/date | Easy |
| 🟡 Medium | Admin stats dashboard card | Quick view of monthly enquiries | Easy |
| 🟡 Medium | Rich text announcements (Quill.js) | Bold, links, line breaks in notices | Easy |
| 🟢 Low-Med | Self-hosted Inter font | Remove Google Fonts dependency | Easy |
| 🟢 Low | Image blur placeholders | Smooth fade-in for gallery | Easy |
| 🟢 Low-Med | Video thumbnail generation (ffmpeg) | Gallery shows video previews | Medium |
| 🟡 Medium | JSON-LD on About + Pricing pages | More Google rich results | Easy |
| 🟢 Low | Keyboard-accessible mobile menu | WCAG 2.1 AA compliance | Easy |
| 🟠 High | Rate limiting on booking endpoint | Prevent spam submissions | Easy |
| 🟠 High | Blog / News section | Long-tail SEO, shareable content | Hard |
| 🟡 Medium | Achievements dedicated page | Credibility + parent trust | Easy |
| 🟡 Medium | Multi-admin roles | Scale to more branches/staff | Hard |

---

## 12. Troubleshooting

| Problem | What to Check / Do |
|---------|-------------------|
| Admin panel locked out | Wait 15 minutes (5 failed attempts triggers lockout) |
| Session expired | Log back in at `/admin.html` |
| Photo uploaded but not showing | Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R) |
| Website shows "Loading..." forever | Server (Node.js) may be down — run `pm2 status` or `node server.js` on the server |
| Student can't find a document | Check Section 3 in admin — confirm the file is listed there |
| Deleted something by mistake | No undo — re-upload from your phone/computer |
| Google Maps not showing for a branch | Re-copy the embed URL from Google Maps → Share → Embed a map |
| API returns 401 Unauthorized | JWT token expired — log out and log back in |
| API returns 404 | Wrong endpoint URL, or the item doesn't exist |
| File upload fails | Check file size (photos: auto-compressed; videos: max 100MB; PDFs: no limit set) |
| PWA not installing on iOS | HTTPS must be active — the service worker won't register over HTTP |
| Theme flashes wrong colour on load | `theme.js` must be the FIRST script in `<head>` |
| WhatsApp messages not sending | Check `wa-config.json` for correct gateway URL + API key |

### Restarting the Server

```bash
# If using PM2 (recommended for production)
pm2 restart ifsa
pm2 logs ifsa --lines 50   # view recent logs

# If running manually
pkill -f "node server.js"
node server.js &
```

### Changing the Admin Password

Run this on the server (not in the browser):
```bash
node change-password.js
```
Follow the prompts. This updates the hashed password in the environment.

---

## 13. Security Checklist

Run through this list before going live and after any major change.

- [ ] HTTPS is active via nginx (mandatory — PWA won't work without it)
- [ ] Admin password is strong (12+ characters, letters + numbers + symbols)
- [ ] Admin panel URL is not linked anywhere on the public website
- [ ] Never share the admin password over WhatsApp or email in plain text
- [ ] Log out of admin panel when done, especially on shared computers
- [ ] Rate limiting is active: 5 login attempts per 15 minutes per IP
- [ ] JWT tokens expire after 8 hours (sessionStorage cleared on tab close)
- [ ] All file uploads are validated by MIME type (not just extension)
- [ ] Path traversal protection is active (`path.basename` on all filenames)
- [ ] HTTP security headers are set: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- [ ] `robots.txt` blocks `/admin.html` and `/uploads/` from crawlers
- [ ] Activity log is checked regularly for unexpected actions
- [ ] Booking endpoint has rate limiting (pending — add 3 submissions/phone/day limit)

---

*This guide covers the full IFSA website as of May 2026.*  
*For code changes, provide this document to your developer — all bugs and planned features are fully specified above.*
