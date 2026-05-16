// ============================================================
//  IFSA — Shared Theme Manager (Phase 1)
//  Reads localStorage before first paint to prevent flash.
//  Exposes window.toggleTheme() callable from any page.
//  Syncs theme across open tabs via storage event.
// ============================================================
(function () {
    'use strict';

    var KEY  = 'ifsa-theme';
    var root = document.documentElement;

    // ── Apply saved preference immediately (before paint) ──
    var saved = localStorage.getItem(KEY) || 'dark';
    root.classList.toggle('light', saved === 'light');

    // ── Global toggle callable from any button ─────────────
    window.toggleTheme = function () {
        var isNowLight = root.classList.toggle('light');
        var next = isNowLight ? 'light' : 'dark';
        localStorage.setItem(KEY, next);
        // Update all theme icons on the page
        document.querySelectorAll('.theme-icon').forEach(function (el) {
            el.textContent = isNowLight ? '🌙' : '☀️';
        });
    };

    // ── Sync across open tabs ──────────────────────────────
    window.addEventListener('storage', function (e) {
        if (e.key === KEY && e.newValue) {
            root.classList.toggle('light', e.newValue === 'light');
        }
    });
})();
