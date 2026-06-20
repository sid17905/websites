// ============================================================
//  IFSA SEARCH UI  — Phase 2
//  Injects the search bar into every page's navbar.
//  Depends on: search-index.js (must load first)
//  Features:
//    • 200ms debounced live filter on SEARCH_DATA
//    • Up to 8 results with section badge + snippet
//    • ↑ ↓ arrow key navigation + Enter to go
//    • Escape to close
//    • / key anywhere focuses the bar (like GitHub)
//    • Mobile: collapses to 🔍 icon, expands full-width overlay
// ============================================================

(function () {
    'use strict';

    /* ── Wait for DOM ──────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        injectStyles();
        injectDesktopSearch();
        injectMobileSearch();
        bindSlashKey();
    }

    /* ── Section icon map ──────────────────────────────────── */
    var ICONS = {
        'Home':      '🏠',
        'About':     '⚡',
        'Programs':  '🥋',
        'Gallery':   '🖼️',
        'Schedule':  '📅',
        'Grading':   '🥇',
        'Documents': '📄',
        'Pricing':   '💰',
        'Payment':   '💳',
        'Locations': '📍',
        'Contact':   '📞',
    };

    function iconFor(section) {
        return ICONS[section] || '🔍';
    }

    /* ── Debounce helper ───────────────────────────────────── */
    function debounce(fn, ms) {
        var t;
        return function () {
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(null, args); }, ms);
        };
    }

    /* ── Core search logic ─────────────────────────────────── */
    function search(query) {
        var q = query.trim().toLowerCase();
        if (!q || q.length < 2) return [];
        var data = window.SEARCH_DATA || [];
        var results = [];
        for (var i = 0; i < data.length; i++) {
            var entry = data[i];
            var haystack = [
                entry.title || '',
                (entry.keywords || []).join(' '),
                entry.snippet || '',
                entry.section || ''
            ].join(' ').toLowerCase();
            if (haystack.indexOf(q) !== -1) {
                results.push(entry);
                if (results.length >= 8) break;
            }
        }
        return results;
    }

    /* ── Build a result item element ───────────────────────── */
    function buildItem(entry, idx) {
        var li = document.createElement('li');
        li.className = 'ifsa-search-item';
        li.setAttribute('role', 'option');
        li.setAttribute('data-idx', idx);
        li.setAttribute('data-href', entry.page || '#');

        var icon = document.createElement('span');
        icon.className = 'ifsa-search-item-icon';
        icon.textContent = iconFor(entry.section);

        var body = document.createElement('span');
        body.className = 'ifsa-search-item-body';

        var title = document.createElement('span');
        title.className = 'ifsa-search-item-title';
        title.textContent = entry.title || '';

        var meta = document.createElement('span');
        meta.className = 'ifsa-search-item-meta';

        var badge = document.createElement('span');
        badge.className = 'ifsa-search-item-badge';
        badge.textContent = entry.section || '';

        var snippet = document.createElement('span');
        snippet.className = 'ifsa-search-item-snippet';
        snippet.textContent = entry.snippet || '';

        meta.appendChild(badge);
        meta.appendChild(snippet);
        body.appendChild(title);
        body.appendChild(meta);
        li.appendChild(icon);
        li.appendChild(body);

        li.addEventListener('mousedown', function (e) {
            e.preventDefault(); // prevent input blur before click
            navigate(entry.page);
        });

        return li;
    }

    /* ── Navigate to a result ──────────────────────────────── */
    function navigate(href) {
        if (!href) return;
        // Use View Transition if available (matches existing site behaviour)
        if (document.startViewTransition) {
            var url;
            try { url = new URL(href, location.href); } catch (_) {}
            if (url && url.origin === location.origin) {
                document.startViewTransition(function () { location.href = url.href; });
                return;
            }
        }
        location.href = href;
    }

    /* ── Create a search widget (input + dropdown) ─────────── */
    function createWidget(id) {
        var wrap = document.createElement('div');
        wrap.className = 'ifsa-search-wrap';
        wrap.id = 'ifsa-search-wrap-' + id;
        wrap.setAttribute('role', 'combobox');
        wrap.setAttribute('aria-haspopup', 'listbox');
        wrap.setAttribute('aria-expanded', 'false');

        var inputWrap = document.createElement('div');
        inputWrap.className = 'ifsa-search-input-wrap';

        var icon = document.createElement('span');
        icon.className = 'ifsa-search-icon';
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'ifsa-search-input';
        input.id = 'ifsa-search-input-' + id;
        input.placeholder = 'Search…';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Site search');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', 'ifsa-search-list-' + id);

        var kbd = document.createElement('kbd');
        kbd.className = 'ifsa-search-kbd';
        kbd.textContent = '/';

        inputWrap.appendChild(icon);
        inputWrap.appendChild(input);
        inputWrap.appendChild(kbd);

        var dropdown = document.createElement('ul');
        dropdown.className = 'ifsa-search-dropdown';
        dropdown.id = 'ifsa-search-list-' + id;
        dropdown.setAttribute('role', 'listbox');
        dropdown.setAttribute('aria-label', 'Search results');

        wrap.appendChild(inputWrap);
        wrap.appendChild(dropdown);

        // State
        var activeIdx = -1;
        var lastQuery = '';

        function showDropdown(results) {
            dropdown.innerHTML = '';
            activeIdx = -1;

            if (results.length === 0) {
                var empty = document.createElement('li');
                empty.className = 'ifsa-search-empty';
                empty.textContent = 'No results for "' + lastQuery + '" — try a different term.';
                dropdown.appendChild(empty);
            } else {
                results.forEach(function (entry, i) {
                    dropdown.appendChild(buildItem(entry, i));
                });
            }
            dropdown.classList.add('ifsa-search-open');
            wrap.setAttribute('aria-expanded', 'true');
            kbd.style.display = 'none';
        }

        function hideDropdown() {
            dropdown.classList.remove('ifsa-search-open');
            wrap.setAttribute('aria-expanded', 'false');
            activeIdx = -1;
            kbd.style.display = '';
        }

        function setActive(idx) {
            var items = dropdown.querySelectorAll('.ifsa-search-item');
            items.forEach(function (el) { el.classList.remove('ifsa-search-active'); });
            activeIdx = idx;
            if (idx >= 0 && idx < items.length) {
                items[idx].classList.add('ifsa-search-active');
                items[idx].scrollIntoView({ block: 'nearest' });
                input.setAttribute('aria-activedescendant', items[idx].id || '');
            }
        }

        var doSearch = debounce(function (q) {
            lastQuery = q;
            if (!q || q.length < 2) { hideDropdown(); return; }
            var results = search(q);
            showDropdown(results);
        }, 200);

        input.addEventListener('input', function () {
            doSearch(input.value);
        });

        input.addEventListener('focus', function () {
            if (input.value.trim().length >= 2) {
                doSearch(input.value);
            }
        });

        input.addEventListener('blur', function () {
            // Small delay so mousedown on item fires first
            setTimeout(function () { hideDropdown(); }, 150);
        });

        input.addEventListener('keydown', function (e) {
            var items = dropdown.querySelectorAll('.ifsa-search-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(Math.min(activeIdx + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(Math.max(activeIdx - 1, 0));
            } else if (e.key === 'Enter') {
                if (activeIdx >= 0 && items[activeIdx]) {
                    navigate(items[activeIdx].getAttribute('data-href'));
                } else if (lastQuery) {
                    // go to first result if any
                    var first = dropdown.querySelector('.ifsa-search-item');
                    if (first) navigate(first.getAttribute('data-href'));
                }
            } else if (e.key === 'Escape') {
                hideDropdown();
                input.blur();
            }
        });

        // Expose focus method for external callers
        wrap._focusInput = function () { input.focus(); };

        return wrap;
    }

    /* ── Desktop search injection ──────────────────────────── */
    function injectDesktopSearch() {
        // Find the desktop nav (hidden md:flex div inside <header>)
        var header = document.querySelector('header');
        if (!header) return;

        // Look for the desktop nav container
        var desktopNav = header.querySelector('.hidden.md\\:flex, .hidden.md\\:flex.items-center');
        if (!desktopNav) {
            // Fallback: find any flex div in nav that contains nav links
            var nav = header.querySelector('nav');
            if (nav) {
                var divs = nav.querySelectorAll('div');
                for (var i = 0; i < divs.length; i++) {
                    if (divs[i].classList.contains('hidden')) {
                        desktopNav = divs[i];
                        break;
                    }
                }
            }
        }
        if (!desktopNav) return;

        var widget = createWidget('desktop');
        widget.classList.add('ifsa-search-desktop');

        // Insert before the theme toggle button (last button in desktop nav)
        var themeBtn = desktopNav.querySelector('.theme-toggle');
        if (themeBtn) {
            desktopNav.insertBefore(widget, themeBtn);
        } else {
            // Insert before the last child
            var last = desktopNav.lastElementChild;
            desktopNav.insertBefore(widget, last);
        }

        window._ifsaDesktopSearch = widget;
    }

    /* ── Mobile search injection ───────────────────────────── */
    function injectMobileSearch() {
        var header = document.querySelector('header');
        if (!header) return;

        // Find the mobile hamburger area (md:hidden div in nav)
        var nav = header.querySelector('nav');
        if (!nav) return;

        var mobileArea = nav.querySelector('.md\\:hidden');
        if (!mobileArea) {
            // Fallback
            var divs = nav.querySelectorAll('div');
            for (var i = divs.length - 1; i >= 0; i--) {
                if (divs[i].classList.contains('md:hidden')) {
                    mobileArea = divs[i];
                    break;
                }
            }
        }
        if (!mobileArea) return;

        // Create mobile search toggle button
        var btn = document.createElement('button');
        btn.className = 'ifsa-mobile-search-btn';
        btn.setAttribute('aria-label', 'Open search');
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

        mobileArea.insertBefore(btn, mobileArea.firstChild);

        // Create fullscreen overlay
        var overlay = document.createElement('div');
        overlay.className = 'ifsa-mobile-overlay';
        overlay.id = 'ifsa-mobile-overlay';

        var overlayInner = document.createElement('div');
        overlayInner.className = 'ifsa-mobile-overlay-inner';

        var closeBtn = document.createElement('button');
        closeBtn.className = 'ifsa-mobile-close';
        closeBtn.setAttribute('aria-label', 'Close search');
        closeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        var mobileWidget = createWidget('mobile');
        mobileWidget.classList.add('ifsa-search-mobile-widget');

        overlayInner.appendChild(closeBtn);
        overlayInner.appendChild(mobileWidget);
        overlay.appendChild(overlayInner);
        document.body.appendChild(overlay);

        function openOverlay() {
            overlay.classList.add('ifsa-mobile-overlay-open');
            document.body.style.overflow = 'hidden';
            setTimeout(function () { mobileWidget._focusInput(); }, 50);
        }

        function closeOverlay() {
            overlay.classList.remove('ifsa-mobile-overlay-open');
            document.body.style.overflow = '';
        }

        btn.addEventListener('click', openOverlay);
        closeBtn.addEventListener('click', closeOverlay);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeOverlay();
        });

        window._ifsaMobileSearch = { open: openOverlay, close: closeOverlay };
    }

    /* ── / key global shortcut ─────────────────────────────── */
    function bindSlashKey() {
        document.addEventListener('keydown', function (e) {
            if (e.key !== '/') return;
            var tag = (document.activeElement || {}).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            // Focus desktop search first, fall back to mobile overlay
            if (window._ifsaDesktopSearch && window.innerWidth >= 768) {
                window._ifsaDesktopSearch._focusInput();
            } else if (window._ifsaMobileSearch) {
                window._ifsaMobileSearch.open();
            }
        });
    }

    /* ── Inject all CSS via <style> ────────────────────────── */
    function injectStyles() {
        var style = document.createElement('style');
        style.id = 'ifsa-search-styles';
        style.textContent = getCSS();
        document.head.appendChild(style);
    }

    function getCSS() {
        return [
            /* ── Desktop wrap ── */
            '.ifsa-search-desktop { position:relative; }',

            '.ifsa-search-wrap { position:relative; }',

            '.ifsa-search-input-wrap {',
            '  display:flex; align-items:center;',
            '  background:rgba(255,255,255,0.07);',
            '  border:1px solid rgba(251,191,36,0.25);',
            '  border-radius:8px;',
            '  padding:0 10px;',
            '  gap:6px;',
            '  transition:border-color 0.2s, background 0.2s, box-shadow 0.2s;',
            '  width:160px;',
            '}',

            '.ifsa-search-input-wrap:focus-within {',
            '  border-color:rgba(251,191,36,0.7);',
            '  background:rgba(255,255,255,0.10);',
            '  box-shadow:0 0 0 3px rgba(251,191,36,0.12);',
            '  width:220px;',
            '}',

            /* Transition width on focus */
            '.ifsa-search-input-wrap { transition:width 0.25s cubic-bezier(0.4,0,0.2,1), border-color 0.2s, background 0.2s, box-shadow 0.2s; }',

            '.ifsa-search-icon { color:rgba(251,191,36,0.7); flex-shrink:0; display:flex; align-items:center; }',

            '.ifsa-search-input {',
            '  background:transparent !important;',
            '  border:none !important;',
            '  outline:none !important;',
            '  color:var(--text-main, #f8fafc);',
            '  font-size:13px;',
            '  font-family:inherit;',
            '  width:100%;',
            '  padding:7px 0;',
            '  min-width:0;',
            '}',

            '.ifsa-search-input::placeholder { color:rgba(148,163,184,0.7); }',

            '.ifsa-search-kbd {',
            '  font-size:10px;',
            '  font-family:inherit;',
            '  background:rgba(251,191,36,0.15);',
            '  color:rgba(251,191,36,0.8);',
            '  border:1px solid rgba(251,191,36,0.25);',
            '  border-radius:4px;',
            '  padding:1px 5px;',
            '  flex-shrink:0;',
            '  pointer-events:none;',
            '  transition:opacity 0.15s;',
            '}',

            /* ── Dropdown ── */
            '.ifsa-search-dropdown {',
            '  position:absolute;',
            '  top:calc(100% + 8px);',
            '  right:0;',
            '  width:360px;',
            '  max-height:380px;',
            '  overflow-y:auto;',
            '  background:rgb(15,23,42);',
            '  border:1px solid rgba(251,191,36,0.3);',
            '  border-radius:12px;',
            '  box-shadow:0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(251,191,36,0.1);',
            '  list-style:none;',
            '  margin:0; padding:6px;',
            '  display:none;',
            '  z-index:9999;',
            '  scroll-behavior:smooth;',
            '}',

            '.ifsa-search-dropdown.ifsa-search-open { display:block; animation:ifsa-drop-in 0.15s ease; }',

            '@keyframes ifsa-drop-in {',
            '  from { opacity:0; transform:translateY(-6px); }',
            '  to   { opacity:1; transform:translateY(0); }',
            '}',

            /* ── Result item ── */
            '.ifsa-search-item {',
            '  display:flex;',
            '  align-items:flex-start;',
            '  gap:10px;',
            '  padding:9px 10px;',
            '  border-radius:8px;',
            '  cursor:pointer;',
            '  transition:background 0.12s;',
            '}',

            '.ifsa-search-item:hover, .ifsa-search-item.ifsa-search-active {',
            '  background:rgba(251,191,36,0.1);',
            '}',

            '.ifsa-search-item-icon {',
            '  font-size:16px;',
            '  line-height:1;',
            '  flex-shrink:0;',
            '  margin-top:1px;',
            '}',

            '.ifsa-search-item-body {',
            '  display:flex;',
            '  flex-direction:column;',
            '  gap:3px;',
            '  min-width:0;',
            '}',

            '.ifsa-search-item-title {',
            '  font-size:13px;',
            '  font-weight:600;',
            '  color:var(--text-main, #f8fafc);',
            '  white-space:nowrap;',
            '  overflow:hidden;',
            '  text-overflow:ellipsis;',
            '}',

            '.ifsa-search-item-meta {',
            '  display:flex;',
            '  align-items:center;',
            '  gap:8px;',
            '  flex-wrap:wrap;',
            '}',

            '.ifsa-search-item-badge {',
            '  font-size:10px;',
            '  font-weight:700;',
            '  letter-spacing:0.06em;',
            '  text-transform:uppercase;',
            '  background:rgba(251,191,36,0.15);',
            '  color:#fbbf24;',
            '  border:1px solid rgba(251,191,36,0.25);',
            '  border-radius:4px;',
            '  padding:1px 6px;',
            '  flex-shrink:0;',
            '}',

            '.ifsa-search-item-snippet {',
            '  font-size:11px;',
            '  color:var(--text-muted, #94a3b8);',
            '  white-space:nowrap;',
            '  overflow:hidden;',
            '  text-overflow:ellipsis;',
            '  max-width:220px;',
            '}',

            '.ifsa-search-empty {',
            '  padding:16px 12px;',
            '  color:var(--text-muted, #94a3b8);',
            '  font-size:13px;',
            '  text-align:center;',
            '}',

            /* ── Mobile search button ── */
            '.ifsa-mobile-search-btn {',
            '  background:transparent;',
            '  border:1px solid rgba(251,191,36,0.35);',
            '  border-radius:8px;',
            '  color:rgba(251,191,36,0.9);',
            '  padding:6px 8px;',
            '  display:flex;',
            '  align-items:center;',
            '  justify-content:center;',
            '  cursor:pointer;',
            '  margin-right:8px;',
            '  transition:background 0.2s, border-color 0.2s;',
            '}',

            '.ifsa-mobile-search-btn:hover {',
            '  background:rgba(251,191,36,0.12);',
            '  border-color:rgba(251,191,36,0.6);',
            '}',

            /* ── Mobile overlay ── */
            '.ifsa-mobile-overlay {',
            '  position:fixed;',
            '  inset:0;',
            '  background:rgba(15,23,42,0.97);',
            '  z-index:99999;',
            '  display:flex;',
            '  flex-direction:column;',
            '  align-items:stretch;',
            '  opacity:0;',
            '  pointer-events:none;',
            '  transition:opacity 0.2s;',
            '}',

            '.ifsa-mobile-overlay.ifsa-mobile-overlay-open {',
            '  opacity:1;',
            '  pointer-events:all;',
            '}',

            '.ifsa-mobile-overlay-inner {',
            '  padding:16px 16px 20px;',
            '  display:flex;',
            '  flex-direction:column;',
            '  gap:12px;',
            '}',

            '.ifsa-mobile-close {',
            '  align-self:flex-end;',
            '  background:rgba(255,255,255,0.07);',
            '  border:1px solid rgba(255,255,255,0.12);',
            '  border-radius:50%;',
            '  color:#f8fafc;',
            '  width:36px; height:36px;',
            '  display:flex; align-items:center; justify-content:center;',
            '  cursor:pointer;',
            '  transition:background 0.2s;',
            '}',
            '.ifsa-mobile-close:hover { background:rgba(251,191,36,0.15); }',

            '.ifsa-search-mobile-widget { width:100%; }',

            '.ifsa-search-mobile-widget .ifsa-search-input-wrap {',
            '  width:100% !important;',
            '  padding:0 14px;',
            '}',

            '.ifsa-search-mobile-widget .ifsa-search-input { font-size:16px; padding:10px 0; }',

            '.ifsa-search-mobile-widget .ifsa-search-dropdown {',
            '  width:100%;',
            '  left:0; right:0;',
            '  max-height:calc(100vh - 160px);',
            '  border-radius:10px;',
            '}',

            /* ── Scrollbar for dropdown ── */
            '.ifsa-search-dropdown::-webkit-scrollbar { width:4px; }',
            '.ifsa-search-dropdown::-webkit-scrollbar-track { background:transparent; }',
            '.ifsa-search-dropdown::-webkit-scrollbar-thumb { background:rgba(251,191,36,0.4); border-radius:2px; }',
        ].join('\n');
    }

})();
