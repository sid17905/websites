# IFSA Website — Complete Feature Inventory & What to Build Next

**Indian Fit Sports Academy | ifsaacademy.in**
*Comprehensive audit based on all source files — Phases 1–4 fully complete, Phases 5 & 6 complete per code evidence*

---

## PART 1 — WHAT THE WEBSITE CURRENTLY DOES (A to Z)

---

### FRONTEND PAGES (7 public + 1 admin + 2 system)

| Page | File | Purpose |
|---|---|---|
| Home | INDEX.html | Main landing page, all sections |
| About | about.html | Academy history, affiliations, team |
| Gallery | gallery.html | Full masonry photo/video gallery |
| Schedule | calender.html | Events calendar + timetable |
| Documents | documents.html | Downloadable PDFs |
| Pricing | pricing.html | Plans, booking form |
| Admin | admin.html | Password-protected CMS |
| 404 | 404.html | Custom branded error page |
| Offline | offline.html | PWA offline fallback page |

---

### DESIGN SYSTEM & GLOBAL UI

- **Color scheme** — Deep navy dark mode (`#0f172a` primary) with amber/gold accent (`#fbbf24`). Full dark/light toggle with `localStorage` persistence and a `<head>` script that restores preference on load — zero flash of wrong theme.
- **Typography** — Inter (Google Fonts) loaded with `preconnect` hints for speed.
- **CSS variables** — `STYLE.css` defines `--bg-primary-rgb`, `--accent-color`, `--text-main`, `--text-muted` etc., with a `html.light` block that overrides everything for light mode.
- **Tailwind CSS** — loaded via CDN, extended with brand color aliases that map to CSS variables.
- **Custom amber cursor dot** — desktop-only; hidden on touch devices via `pointer: coarse` media query.
- **Scroll progress bar** — thin amber line at the top of the viewport, fills as user scrolls.
- **Animated background particles** — hero canvas uses `requestAnimationFrame` particle system; floats, fades, respects scroll parallax.
- **Parallax hero** — particle canvas shifts at `0.25×` scroll speed, ambient glow at `0.15×`; wrapped in `prefers-reduced-motion` guard.
- **Gradient divider lines** — horizontal amber gradient separators between sections and under the navbar.
- **Faded watermark text** — large ~4% opacity section labels (e.g., "GALLERY", "FIND US", "IFSA") sit behind content.
- **Diagonal lines texture** — `diagonal-lines` CSS class applies subtle repeating SVG background to certain sections.
- **Karate silhouette SVGs** — three hand-drawn SVG karate poses (crane stance, side kick, high kick) at ~4.5% opacity in belt timeline and programs sections.
- **Sticky header** — `position: sticky; top: 0; z-index: 50` with `backdrop-blur-xl` and amber bottom border.
- **Page transition animations** — View Transitions API (`document.startViewTransition`) on all same-origin link clicks; graceful fallback for unsupported browsers.
- **Button ripple effect** — click on any `.btn-shimmer` element produces an expanding amber ripple.
- **Magnetic button effect** — desktop only; primary CTAs ("Join Now", "Book Trial") subtly follow cursor via `mousemove` → `translate()`.
- **Staggered card entrance** — `.stagger-card` elements start invisible and fade/slide in via `IntersectionObserver` with per-card delay (60ms offset).
- **Reveal-up animation** — `.reveal-up` class triggers a fade+translate-up when element scrolls into view.
- **WhatsApp FAB** — fixed bottom-right floating button on every page, pre-fills WhatsApp message: *"Hi IFSA! I'd like to enquire about joining your karate classes."* Has double pulse ring animation.

---

### HOME PAGE (INDEX.html) — Section by Section

#### Preloader
- Full-screen logo spinner with three concentric animated rings (spin, spin-reverse, scale-pulse) and a central logo image.
- Fades out 1.5s after `window.load`, then page content slides in with a `wipe-out` animation.

#### Navbar
- Logo (round, amber border, hover scale + glow).
- Desktop: links with small SVG icons above each label — Home, About, Programs, Gallery, Schedule, Docs, Admin, **Join Now** CTA, theme toggle.
- Mobile: hamburger menu → full-width dropdown with same links + dual CTA row (Admin | Join Now).

#### Hero Section
- **Hero video background** — if admin has uploaded an MP4/WebM, it plays fullscreen (autoplay, muted, loop) with a gradient overlay; otherwise the photo slideshow runs.
- **Photo slideshow** — two infinite-scroll rows of images (one left-to-right, one right-to-left) with slight rotation per image. Loaded from `/api/slideshow/images`.
- **Typewriter effect** — "ICHIBAN SHITO-RYU KARATE-DO ORGANIZATION INDIA" types out after preloader.
- **Affiliation logos** — ISKO, AKF, WKF, KIO logos displayed on mobile as a separate strip; on desktop inside the hero.
- **Hero CTAs** — "Book Free Trial" (anchor to booking form) + "See Programs" (anchor to programs section).

#### Stats Bar
- Four animated counter numbers: `500+` Students Trained, `15+` Years Active, `50+` Medals Won, `4` Mumbai Locations.
- Numbers count up from 0 using `requestAnimationFrame` + easing when scrolled into view.

#### Programs Section
- Three program cards: Kids Karate (5–14 yrs), Adult Karate (15+ yrs), Competition Training.
- Each card has icon, title, description, age range badge, and a "Learn More" CTA linking to `pricing.html`.

#### Locations Section
- Dynamically loaded from `/api/locations`.
- Each location card shows: name, label/subtitle, embedded Google Map iframe, Beginner/Advanced pricing with feature lists.

#### Why Choose IFSA
- Four feature cards: Expert Instructors, All Ages & Levels, Top Facility, Community.
- Cards hover lift (`-translate-y-2`) + icon rotate on hover.

#### Instructors Section
- Dynamically loaded from `/api/instructors`.
- **3D flip cards** — front shows portrait photo, name, role, rank; back shows action photo with bio overlay.
- Desktop: flip on hover. Mobile: tap-to-toggle via `.tapped` class (JS detects touch devices).
- Mobile shows "Tap ✦" badge.

#### Belt Rank Progression Timeline
- Seven belt nodes: White → Yellow → Orange → Green → Blue → Brown → Black.
- Each node has a colour-matched chip, belt name, level description, and minimum time.
- Black Belt node has amber glow ring and star SVG.
- Nodes animate in with staggered delays (0.1s per node) via `IntersectionObserver`.
- Connector line between nodes uses CSS animation on `width` (grows left to right on scroll).

#### Class Timetable
- Grid: Days (Mon–Sat) × Slots (Morning 6–8 AM / Evening 5–7 PM / Advanced).
- Dynamically populated from `/api/timetable`.
- Empty slots show a dash; filled slots show batch name, time, and instructor name.
- Horizontal scroll on mobile.

#### Testimonials Carousel
- Dynamically loaded from `/api/testimonials`.
- Auto-advances every 5 seconds.
- Dot navigation + left/right arrow buttons (hidden on mobile, shown on desktop).
- Each card: student photo, quote, name, belt rank.

#### Trial Class Booking Form
- Fields: Full Name*, Phone*, Age, Preferred Session (morning/evening/weekend).
- `POST /api/bookings/add` — saves to server JSON + Excel file.
- Success/error states shown inline; button shows loading state.

#### CTA Banner
- Amber gradient banner: "Ready to Start?" + "Sign Up Now" → pricing.html.

#### Footer
- Four columns: brand + tagline, Quick Links, Contact Us (phone, email, Instagram, Facebook), Visit Us (address).
- Dynamic current year via JS.
- IFSA faded watermark behind footer content.

---

### GALLERY PAGE

- Masonry grid using CSS `columns` property (1 → 2 → 3 → 4 columns as viewport grows).
- Images and videos loaded from `/api/gallery/images`.
- Each card: hover scale effect on image + "View" overlay button.
- Clicking image opens it in a new tab (full resolution).
- Videos rendered with native `<video controls>`.
- Month/year badge on each card (amber text, bottom bar).
- Staggered entrance animations (60ms delay per card via `IntersectionObserver`).
- "Loading Images..." pulse text shown while fetching.
- Empty state message with return-home link if no images.

---

### SCHEDULE PAGE (calender.html)

- Dynamically loaded from `/api/schedule/list`.
- Events filtered and sorted by date.
- Colour-coded by type: General (blue), Exam (amber), Tournament (red), Holiday (green).
- Current month highlighted.
- Announcement banner at top from `/api/announcement/list` (auto-filters expired ones).

---

### DOCUMENTS PAGE

- Lists all uploaded PDFs from `/api/documents/list`.
- Each item: title, upload date, download button (direct link to file), open-in-tab button.
- Empty state if no docs uploaded.

---

### PRICING PAGE

- Two plan cards per location (Beginner + Advanced), dynamically loaded from `/api/locations`.
- Staggered entrance animation (0ms / 120ms offset).
- Feature lists with checkmark icons.
- Highlighted "Popular" badge on Advanced plan.
- Inline trial booking form (same fields + API as homepage form).
- Class timetable widget (same as homepage, both pull `/api/timetable`).

---

### ABOUT PAGE

- Academy history (founded 2008).
- Affiliations section: WKF, AKF, ISKO, KIO logos with descriptions.
- Instructors grid (same flip-card component as homepage, loaded from `/api/instructors`).
- Mission / values section.
- Contact details + WhatsApp CTA.

---

### ADMIN PANEL (admin.html)

**Authentication**
- Login overlay with password field; submits to `POST /api/admin/login`.
- bcrypt password comparison server-side; JWT token returned (8-hour expiry).
- Token stored in `sessionStorage` (auto-clears on tab close).
- Live countdown session timer in dashboard header.
- Auto-login if valid token already exists (verified against server on page load).
- Rate limit UI: after failed attempts, warning message shown; 5 attempts per 15 min.
- Logout button clears token + reloads.
- DOMPurify sanitizes all server data before DOM insertion.

**Section 1 — Hero Video**
- Upload MP4/WebM (max 100MB) to replace slideshow on homepage hero.
- Preview player shown if video exists.
- Delete button to revert to slideshow.

**Section 2 — Home Page Slideshow**
- Multi-file image upload (JPEG/PNG/WebP).
- Drag-and-drop reorder via SortableJS → "Save Order" button → `PATCH /api/slideshow/reorder`.
- Delete individual slides.
- Upload auto-compresses images to WebP via Sharp (max 1920px, quality 80).

**Section 3 — Gallery**
- Multi-file upload (images + videos) with Month, Year, and Alt Text fields.
- Bulk delete via checkboxes → "Delete Selected" button.
- Individual delete buttons per image.

**Section 4 — Documents**
- PDF upload with custom title field.
- List of uploaded docs with delete buttons.

**Section 5 — Calendar Schedule**
- Add events: date picker, title, type (General/Exam/Tournament/Holiday).
- Delete events.
- Events display in scrollable list sorted by date.

**Section 6 — Notice Board (Announcements)**
- Add announcement with optional expiry date (date picker).
- Server auto-filters expired announcements on public fetch.
- Delete individual announcements.

**Section 7 — Locations & Pricing**
- Add new location: name, subtitle, Google Maps embed URL, Beginner plan (price + features), Advanced plan (price + features).
- Delete locations.

**Section 8 — Instructors**
- Add instructor: name, role, rank, description, front photo (portrait), back photo (action shot).
- Delete instructors.

**Section 9 — Trial Bookings**
- Table view of all bookings (name, phone, email, branch, age, session, date, status).
- Status toggle: Pending → Contacted → Enrolled (colour-coded badges).
- Delete individual bookings.

**Section 10 — Timetable**
- Add slots: day (Mon–Sat), time slot (Morning/Evening/Advanced), batch name, time string, instructor.
- Delete slots.

**Section 11 — Activity Log**
- Last 20 admin actions automatically recorded: timestamp, action type, item name, IP address.
- Refresh button to reload log.

---

### BACKEND / SERVER (server.js)

**Security**
- bcrypt password hashing (12 rounds).
- JWT sessions (8-hour expiry), Bearer token auth.
- Rate limiting: 5 login attempts per 15 min per IP (`express-rate-limit`).
- MIME-type file validation (not just extension): images, videos, PDFs.
- Path traversal protection (`path.basename` on all user-supplied filenames).
- HTTP security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`.

**Image Pipeline**
- Sharp compresses all uploaded images: resize to max 1920px width, convert to WebP, quality 80.
- Applied to slideshow uploads and gallery uploads.

**Data Storage (JSON files)**
- `gallery-data.json` — gallery metadata (filename, month, year, alt text).
- `document-data.json` — document metadata (filename, title, date).
- `schedule-data.json` — calendar events.
- `announcement-data.json` — notices with optional expiry.
- `data/locations.json` — branch locations + pricing.
- `data/instructors.json` — instructor profiles.
- `data/testimonials.json` — student testimonials.
- `data/timetable.json` — weekly class grid.
- `data/hero-video.json` — current hero video filename.
- `data/slideshow-order.json` — custom slide display order.
- `admin-log.json` — activity log (last 200 entries).
- `bookings-data.json` — trial class booking submissions.
- `bookings.xlsx` — same bookings exported to Excel via ExcelJS.

**API Endpoints (20+ routes)**
- Auth: `POST /api/admin/login`, `POST /api/admin/verify`
- Slideshow: GET, POST (upload), DELETE, PATCH (reorder)
- Hero video: GET, POST, DELETE
- Gallery: GET, POST, DELETE
- Documents: GET, POST, DELETE
- Locations: GET, POST, DELETE
- Instructors: GET, POST, DELETE
- Schedule: GET, POST, DELETE
- Announcements: GET, POST, DELETE
- Timetable: GET, POST, DELETE
- Testimonials: GET, POST, DELETE
- Bookings: GET (admin), POST (public), PATCH (status), DELETE
- Admin log: GET (admin only)

**PWA & Infrastructure**
- Service worker (`sw.js`): cache-first for static assets, network-first for HTML, API calls bypass cache entirely, offline.html fallback.
- `manifest.json`: PWA manifest with icons, theme color, `display: standalone` (add-to-homescreen support).
- `sitemap.xml`: all 6 public pages with priority + changefreq.
- `robots.txt`: allows all crawlers, blocks `/admin.html` and `/uploads/`.
- Static files served with 1-day cache; HTML served with `no-cache`.
- Service worker served with `no-cache` so updates propagate immediately.
- Custom 404 page served for all unmatched routes.
- JSON 404 for unmatched `/api/` routes.

**SEO**
- `<meta name="description">` on all pages.
- Open Graph tags (og:title, og:description, og:image, og:url) on all pages.
- Twitter Card tags on all pages.
- `<link rel="canonical">` on all pages.
- JSON-LD `SportsActivityLocation` structured data on homepage (name, address, phone, opening hours, geo coordinates, social profiles).
- `loading="lazy"` on all gallery/instructor images.

---

## PART 2 — WHAT TO BUILD NEXT (Major Impact + Polish)

---

### TIER 1 — HIGH IMPACT, VISITOR-FACING (Build These First)

**1. Online Fee Payment Integration**
Currently pricing is display-only. Integrating Razorpay (India's most common gateway) would let prospects pay the first month's fees or deposit online. This closes the loop from "interested visitor" to "paying student" without a phone call. Fields: amount (tied to selected plan), name, phone, UPI/card. Receipt emailed automatically.

**2. Student Login Portal (Basic)**
A separate student-facing login (not the admin login) where enrolled students can check their fee payment history, download their grading certificate PDFs, and see their attendance record. Even a read-only version transforms the website from a brochure into a utility students return to. Auth via phone + OTP (Twilio or Firebase).

**3. Enquiry/Contact Form with Email Notification**
Right now the only enquiry path is WhatsApp. A proper form (name, phone, email, message, preferred branch) with `nodemailer` sending an email to the academy immediately would capture leads who don't want to use WhatsApp. Booking submissions should also trigger an email notification.

**4. WhatsApp API Confirmation Message**
When a trial booking is submitted via the form, automatically send a WhatsApp confirmation to the student's number using the WhatsApp Business API (or a service like Wati/Interakt). "Hi [Name], your trial class at IFSA is booked! We'll contact you within 24 hours." This dramatically improves perceived professionalism.

**5. Google Reviews Widget / Average Rating Display**
Add a live Google rating badge (e.g., "⭐ 4.9 — 120+ Reviews on Google") fetched via the Places API and displayed on the homepage near the testimonials section. Social proof from an external verified source is far more persuasive than curated admin-uploaded testimonials.

---

### TIER 2 — ADMIN CONTROL & DATA (Build These Second)

**6. Export Bookings to CSV / Excel from Admin Panel**
The server already saves to `bookings.xlsx` via ExcelJS, but there's no download button in the admin UI. Add a single "Export Bookings" button that hits a new `GET /api/bookings/export` endpoint and triggers a file download. This alone would be used every week.

**7. Search & Filter in Admin Bookings Table**
As bookings grow, the admin needs to filter by status (Pending/Contacted/Enrolled), by branch, or by date range. Add a simple filter bar above the bookings table — no new API needed, just client-side filtering on the loaded data.

**8. Announcement Push to WhatsApp Broadcast**
When admin adds an announcement, an optional checkbox "Also send to WhatsApp broadcast list" could trigger a WhatsApp API call to the saved contact list. Operationally very high value for a sports academy that does belt gradings, tournaments, and holidays.

**9. Student Count / Enrollment Stats Dashboard Card in Admin**
Show at a glance: total bookings this month, how many converted to Enrolled, conversion rate, and which branch is getting the most enquiries. Simple aggregation over `bookings-data.json` — no new data needed.

**10. Rich Text Announcements**
Currently announcements are plain text. Adding a minimal rich-text editor (like Quill.js, ~100KB) would let the admin post announcements with bold text, links, and line breaks — essential for posting tournament schedules or grading instructions.

---

### TIER 3 — DESIGN POLISH & TECHNICAL (Nice-to-Haves)

**11. Self-Hosted Inter Font**
The site loads Inter from Google Fonts, which is a cross-origin request that can block rendering on slow connections. Downloading the subset (Latin only, weights 400/500/600/700/800) and serving from the same domain eliminates this dependency and slightly improves Lighthouse score.

**12. Image Lazy-Load Blur Placeholder**
When gallery images load, they currently just appear blank until loaded. Adding a tiny blurred base64 placeholder (generated server-side by Sharp at 20px width) gives a smooth fade-in effect and prevents layout shift. Sharp is already installed — this is a one-line addition to the upload route.

**13. Video Thumbnail Generation for Gallery**
Uploaded videos in the gallery show no preview — just a plain black box until the user clicks play. Using `ffmpeg` (or the `fluent-ffmpeg` npm package) to extract a thumbnail frame on upload and save it alongside the video would make the gallery look complete.

**14. Sitemap Auto-Generation**
The current `sitemap.xml` is static. A `GET /sitemap.xml` route that reads the gallery, schedule, and document data and generates a dynamic sitemap would ensure Google always indexes the latest content, including individual event pages if those are ever added.

**15. Page-Specific JSON-LD on About and Pricing**
Currently JSON-LD structured data exists only on the homepage. Adding `FAQPage` schema to the pricing page (answering common questions like "How much do karate classes cost?") and `Person` schema for each instructor on the about page would directly boost Google rich-result eligibility.

**16. Keyboard-Accessible Mobile Menu**
The mobile hamburger menu currently only handles click events. Adding `keydown` listeners for Enter/Space on the toggle button and Escape to close, plus `aria-expanded` attributes, would make it fully accessible and pass WCAG 2.1 AA.

**17. Rate Limiting on Booking Endpoint**
The `POST /api/bookings/add` endpoint is currently public and unprotected. Adding rate limiting (e.g., 3 submissions per phone number per day) prevents spam form submissions that pollute the bookings list.

**18. HTTPS Enforcement Reminder (nginx config)**
The `nginx-ifsa.conf` was created as part of Phase 1 but deploying it is noted as manual. This is the single most important infrastructure step before going live — without HTTPS, the service worker won't register on iOS, and the "Add to Home Screen" PWA prompt won't appear.

---

### TIER 4 — LONG-TERM FEATURES

**19. Online Grading / Syllabus Page**
A page per belt level showing the kata, techniques, and criteria required for the next grading. This would be a massive SEO win ("karate grading syllabus India") and a genuine resource students bookmark and revisit.

**20. Blog / News Section**
A simple blog with admin-created posts (title, date, content, cover image). Even 5–10 posts per year on topics like "Benefits of karate for kids" or "IFSA students at National Championship" would dramatically improve long-tail SEO and give the academy shareable content for Instagram/Facebook.

**21. Achievements / Medals Wall**
A dedicated page listing tournament wins, national rankings, and student achievements with photos. Currently this lives in the gallery mixed with everything else. Separating it signals credibility and gives parents evidence that this academy produces results.

**22. Multi-Admin Roles**
Currently there is one admin password shared by everyone. Adding user accounts (admin creates sub-admins with email + password) with role-based permissions (e.g., a branch manager can only see their branch's bookings) would be essential if the academy scales to more branches or has multiple staff members managing the site.

---

## SUMMARY TABLE

| # | Feature | Impact | Effort | Who Benefits |
|---|---|---|---|---|
| 1 | Online fee payment (Razorpay) | 🔴 Very High | Medium | Prospects → Students |
| 2 | Student login portal | 🔴 Very High | Hard | Enrolled students |
| 3 | Enquiry form + email alert | 🟠 High | Easy | Enquiries |
| 4 | WhatsApp booking confirmation | 🟠 High | Easy | Bookings |
| 5 | Google Reviews widget | 🟠 High | Easy | Trust / SEO |
| 6 | Export bookings button | 🟡 Medium | Easy | Admin |
| 7 | Booking filter/search | 🟡 Medium | Easy | Admin |
| 8 | Announcement WhatsApp push | 🟡 Medium | Medium | Admin ops |
| 9 | Admin stats dashboard | 🟡 Medium | Easy | Admin |
| 10 | Rich text announcements | 🟡 Medium | Easy | Admin |
| 11 | Self-hosted fonts | 🟢 Low-Med | Easy | Performance |
| 12 | Image blur placeholders | 🟢 Low | Easy | Gallery UX |
| 13 | Video thumbnail generation | 🟢 Low-Med | Medium | Gallery UX |
| 14 | Dynamic sitemap | 🟢 Low | Easy | SEO |
| 15 | JSON-LD on more pages | 🟡 Medium | Easy | SEO |
| 16 | Keyboard accessible menu | 🟢 Low | Easy | Accessibility |
| 17 | Booking endpoint rate limit | 🟠 High | Easy | Security |
| 18 | Deploy HTTPS / nginx | 🔴 Critical | Medium | Everything |
| 19 | Grading syllabus page | 🟠 High | Medium | SEO + Students |
| 20 | Blog / news section | 🟠 High | Hard | SEO long-term |
| 21 | Achievements wall | 🟡 Medium | Easy | Trust / UX |
| 22 | Multi-admin roles | 🟡 Medium | Hard | Ops at scale |

---

*Report generated from source audit of: INDEX.html, about.html, gallery.html, calender.html, documents.html, pricing.html, admin.html, server.js, STYLE.css, sw.js, 404.html, offline.html, sitemap.xml, robots.txt, change-password.js, and the four IFSA_Website_Improvement_Plan versions.*
