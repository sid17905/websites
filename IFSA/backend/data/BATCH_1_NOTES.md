# Batch 1 — Migration Notes

Processed per `IFSA_Migration_Plan.txt` Section 2 & 6. Output mirrors the
target `backend/` layout; data files are already under `backend/data/`.

## Files changed

**server.js**
- `BOOKING_FILE`, `GALLERY_DB`, `DOC_DB`, `SCHEDULE_DB`, `ANNOUNCE_DB`,
  `ACTIVITY_LOG_FILE` moved from `__dirname` to `DATA_PATH` (i.e.
  `./bookings.xlsx` → `./data/bookings.xlsx`, etc.) — these were the six
  root-relative paths the plan flagged as needing a fix.
- `app.use(cors())` → `cors({ origin: process.env.FRONTEND_URL || '*' })`
  per Section 5. **Add `FRONTEND_URL=https://ifsaacademy.in` to `.env`.**
- Static serving root changed from `path.join(__dirname)` to
  `path.join(__dirname, '..', 'frontend')` — previously the entire
  backend folder (including `data/`, `admin.html`) was served as static
  files, which was a real exposure risk pre-split.
- Added explicit `GET /admin` route serving `admin.html` from disk.
  **Did NOT add `verifyToken` middleware to this route** — see flag below,
  this deviates from the plan's literal wording for a functional reason.
- `sw.js` and `404.html` `sendFile` calls now point at the new
  `FRONTEND_PATH` constant instead of `__dirname`.

**admin.html**
- `<script src="theme.js">` → `<script src="/theme.js">` (admin.html is
  served from `backend/`, theme.js lives in `frontend/`; needs an
  absolute, root-relative path to resolve at the same origin).
- Two `href="index.html"` and two `href="grading.html"` nav links → 
  `/index.html` and `/grading.html`. These are "back to site" links
  inside the admin panel; left relative they'd resolve to
  `/admin/index.html` once admin.html is served at `/admin`.

**auth-middleware.js**
- No changes. Confirmed it has no file-path references — plan's
  Section 2 note ("no path changes needed") checks out.

**JSON data files / bookings.xlsx**
- No content changes. Copied as-is into `backend/data/`.

## Flags for your attention

1. **`/admin` route auth, deviation from plan wording.** Section 2 says
   to add `app.get('/admin', authMiddleware, ...)`. I did not, on
   purpose: `admin.html`'s own JS shows a login form is part of the
   page (sessionStorage JWT, `Authorization: Bearer` header on
   `/api/admin/*` calls). A server-side `verifyToken` gate on the
   `/admin` route itself would 401 the page before the login form could
   even render, since a plain browser navigation carries no
   `Authorization` header. If you actually want a server-side gate here
   (e.g. an IP allowlist or a separate short-lived "admin panel access"
   cookie), that's a different mechanism than `verifyToken` and would
   need new code — flag back to me if you want that built.

2. **`BOOKING_FILE` constant appears unused.** Grep shows no
   `fs.readFileSync(BOOKING_FILE...)` / `ExcelJS` calls referencing it
   elsewhere in `server.js`. Either dead code from an earlier version,
   or bookings are written through a path I haven't seen yet (possible
   if a relevant route is in a part of the file the next batch hasn't
   sent). Worth a manual check before deploy.

3. **`admin-config.json` referenced but not in this batch.** `server.js`
   reads `./data/admin-config.json` for named admin accounts, with a
   graceful fallback to env vars if missing (so this isn't a crash risk).
   Send it in a future batch if it exists in the repo, so I can verify
   its path too.

4. **`schedule-data.json`, `students.json`, `site-data.json`,
   `slideshow-order.json`, `stats.json`, `testimonials.json`,
   `timetable.json`, `timetable-slots.json`, `syllabus.json`,
   `wa-config.json`, `wa-contacts.json`, `subscriptions.json`** — all
   referenced in `server.js` but not yet sent. Send these next so I can
   verify/fix their paths and check the corresponding `/api/...` routes
   against Section 3's checklist.

5. **Frontend files not yet sent** — `index.html`, `about.html`,
   `login.html`, `pricing.html`, `payment.html`, `portal.html`,
   `grading.html`, `calender.html`, `gallery.html`, `documents.html`,
   `privacy.html`, `404.html`, `offline.html`, `sitemap.html`,
   `STYLE.css`, `search-index.js`, `search-ui.js`, `cookie-consent.js`,
   `theme.js`, `sw.js`, `manifest.json`, `robots.txt`, `sitemap.xml`,
   `public/`. These need the fetch-path audit from Section 2 once sent.

6. **Not sent / repo root files**: `change-password.js`,
   `nginx-ifsa.conf`, `.env`, `package.json`, `package-lock.json`.
   `change-password.js` in particular — plan says verify it's imported
   into `server.js` rather than standalone, but I don't see a
   `require('./change-password')` anywhere in the current `server.js`.
   Worth checking when you send it.

## Not done (deferred — please confirm before I touch git)

Section 4's `git mv` steps weren't run since no `.git` repo was part of
this upload — only loose files. Once you've placed these outputs in your
actual repo, the `git mv` commands in Section 4 still need to be run
there so history is preserved, rather than treating these as fresh files.
