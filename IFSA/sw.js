// ============================================================
//  IFSA Service Worker — PWA Offline Support (Task 3.7)
//  Strategy: Cache-first for static shell, network-first for API.
//  On install: pre-cache the app shell.
//  On fetch:
//    - API calls  → network only (no cache)
//    - HTML pages → network first, fall back to cache, then offline.html
//    - Assets     → cache first, then network
// ============================================================

const CACHE_NAME    = 'ifsa-shell-v1';
const OFFLINE_URL   = '/offline.html';

// Pages and assets to pre-cache on install
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/about.html',
    '/gallery.html',
    '/calender.html',
    '/documents.html',
    '/pricing.html',
    '/404.html',
    '/offline.html',
    '/STYLE.css',
    '/manifest.json',
    '/public/image 1.png',
];

// ── Install: pre-cache the shell ────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(SHELL_ASSETS.map(url => new Request(url, { cache: 'reload' })))
                .catch((err) => {
                    // Individual failures shouldn't block install — log and continue
                    console.warn('[SW] Pre-cache warning (some assets may not exist yet):', err);
                });
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: purge old caches ───────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(
                keyList
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: routing logic ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip cross-origin requests (CDN, fonts, APIs)
    if (url.origin !== location.origin) return;

    // Skip API calls — always go to network
    if (url.pathname.startsWith('/api/')) return;

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // HTML navigation requests: network-first, fall back to cached page or offline.html
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache the fresh response
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() =>
                    caches.match(request)
                        .then((cached) => cached || caches.match(OFFLINE_URL))
                )
        );
        return;
    }

    // Static assets (CSS, images, fonts): cache-first
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                // For images, return a transparent 1x1 GIF as fallback
                if (request.destination === 'image') {
                    return new Response(
                        atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
                        { headers: { 'Content-Type': 'image/gif' } }
                    );
                }
            });
        })
    );
});
