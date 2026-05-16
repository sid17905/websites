// ============================================================
//  IFSA Service Worker — Phase 4 (Push Notifications)
//  Adds push event listener + notificationclick handler
//  on top of any existing PWA / offline caching logic.
// ============================================================

const CACHE_NAME = 'ifsa-cache-v2';

// ── Install: pre-cache the offline shell ───────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(['/', '/offline.html']).catch(() => {})
        )
    );
});

// ── Activate: clean up old caches ─────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: network-first, fallback to cache / offline ─────
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(resp => {
                // Only cache complete, successful responses — skip 206 Partial Content
                // (range requests for video/audio), redirects, and errors
                if (resp.status === 200 && resp.type !== 'opaque') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return resp;
            })
            .catch(() =>
                caches.match(event.request).then(cached =>
                    cached || caches.match('/offline.html')
                )
            )
    );
});


// ── Phase 4: Push event ───────────────────────────────────
self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'IFSA', body: event.data ? event.data.text() : 'New notification' };
    }

    const title   = data.title   || 'IFSA';
    const options = {
        body:    data.body    || '',
        icon:    data.icon    || '/icons/icon-192.png',
        badge:   data.badge   || '/icons/badge-72.png',
        image:   data.image   || undefined,
        tag:     data.tag     || 'ifsa-push',
        vibrate: [200, 100, 200],
        requireInteraction: false,
        data: {
            url:       data.url       || '/',
            timestamp: Date.now()
        },
        actions: data.actions || [
            { action: 'open',    title: 'Open'    },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});


// ── Phase 4: Notification click ───────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const targetUrl = (event.notification.data && event.notification.data.url)
        ? event.notification.data.url
        : '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // If there's already a window open on the same origin, focus it and navigate
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.focus();
                        if ('navigate' in client) client.navigate(targetUrl);
                        return;
                    }
                }
                // Otherwise open a new window
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
    );
});


// ── Phase 4: Push subscription change ─────────────────────
// Re-subscribe automatically if the browser rotates the sub
self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription
                ? event.oldSubscription.options.applicationServerKey
                : null
        }).then(newSub =>
            fetch('/api/push/subscribe', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(newSub)
            })
        ).catch(() => {})
    );
});