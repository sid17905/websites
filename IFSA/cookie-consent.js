// ============================================================
//  IFSA — Cookie Consent Banner (Phase 1)
//  Shows on first visit, never again after user chooses.
//  "Accept All"    → saves 'accepted',  injects GA
//  "Essential Only"→ saves 'essential', GA never loads
// ============================================================
(function () {
    'use strict';

    var KEY        = 'ifsa_cookie_consent';
    var GA_ID      = 'G-XXXXXXXXXX'; // ← replace with real GA4 ID when ready
    var saved      = localStorage.getItem(KEY);

    // ── If already decided, silently apply and exit ────────
    if (saved) {
        if (saved === 'accepted') injectGA();
        return;
    }

    // ── Build the banner ───────────────────────────────────
    var isLight = document.documentElement.classList.contains('light');

    var banner = document.createElement('div');
    banner.id  = 'ifsa-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.style.cssText = [
        'position:fixed',
        'bottom:0',
        'left:0',
        'right:0',
        'z-index:99990',
        'padding:1rem 1.5rem',
        'display:flex',
        'flex-wrap:wrap',
        'align-items:center',
        'justify-content:space-between',
        'gap:1rem',
        'transform:translateY(100%)',
        'transition:transform 0.4s cubic-bezier(0.4,0,0.2,1)',
        'border-top:1px solid rgba(251,191,36,0.25)',
        'box-shadow:0 -4px 32px rgba(0,0,0,0.5)',
        isLight
            ? 'background:#f1f5f9;color:#0f172a;'
            : 'background:#0f172a;color:#f8fafc;'
    ].join(';');

    banner.innerHTML = [
        '<div style="flex:1;min-width:220px;font-size:0.875rem;line-height:1.6;">',
        '  <strong style="color:#fbbf24;">🍪 Cookies</strong>&nbsp;',
        '  We use cookies for analytics &amp; improving your experience.',
        '  <a href="privacy.html" style="color:#fbbf24;text-decoration:underline;margin-left:4px;">Learn more →</a>',
        '</div>',
        '<div style="display:flex;gap:0.6rem;flex-shrink:0;flex-wrap:wrap;">',
        '  <button id="ifsa-cookie-essential" style="',
        '    padding:0.5rem 1.1rem;border-radius:0.4rem;font-weight:700;font-size:0.82rem;',
        '    border:2px solid #fbbf24;background:transparent;color:#fbbf24;cursor:pointer;',
        '    transition:background 0.2s,color 0.2s;">Essential Only</button>',
        '  <button id="ifsa-cookie-accept" style="',
        '    padding:0.5rem 1.1rem;border-radius:0.4rem;font-weight:700;font-size:0.82rem;',
        '    border:none;background:#fbbf24;color:#000;cursor:pointer;',
        '    transition:background 0.2s;">Accept All</button>',
        '</div>'
    ].join('');

    document.body.appendChild(banner);

    // ── Slide up after a short delay ──────────────────────
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            banner.style.transform = 'translateY(0)';
        });
    });

    // ── Button handlers ────────────────────────────────────
    function dismiss(choice) {
        localStorage.setItem(KEY, choice);
        banner.style.transform = 'translateY(100%)';
        setTimeout(function () { banner.remove(); }, 450);
        if (choice === 'accepted') injectGA();
    }

    document.getElementById('ifsa-cookie-accept').addEventListener('click', function () {
        dismiss('accepted');
    });
    document.getElementById('ifsa-cookie-essential').addEventListener('click', function () {
        dismiss('essential');
    });

    // ── Hover effect for Essential button ─────────────────
    var essBtn = document.getElementById('ifsa-cookie-essential');
    essBtn.addEventListener('mouseenter', function () {
        essBtn.style.background = '#fbbf24'; essBtn.style.color = '#000';
    });
    essBtn.addEventListener('mouseleave', function () {
        essBtn.style.background = 'transparent'; essBtn.style.color = '#fbbf24';
    });

    // ── Inject Google Analytics ────────────────────────────
    function injectGA() {
        if (!GA_ID || GA_ID.includes('XXXXXXXXXX')) return; // skip placeholder
        if (document.getElementById('ifsa-ga-script')) return;
        var s = document.createElement('script');
        s.id  = 'ifsa-ga-script';
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        s.async = true;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', GA_ID);
    }
})();
