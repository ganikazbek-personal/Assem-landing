/* =========================================
   MOBILE NAV
   ========================================= */
const hamburger = document.querySelector('.nav-hamburger');
const drawer    = document.getElementById('nav-drawer');
const drawerClose = drawer.querySelector('.nav-drawer-close');
const drawerLinks = drawer.querySelectorAll('a');

hamburger.addEventListener('click', () => {
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  drawerClose.focus();
});

function closeDrawer() {
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

drawerClose.addEventListener('click', closeDrawer);
drawerLinks.forEach(link => link.addEventListener('click', closeDrawer));

// Close on backdrop click
drawer.addEventListener('click', (e) => {
  if (e.target === drawer) closeDrawer();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
});

/* =========================================
   SCROLL REVEAL
   ========================================= */
const revealEls = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

revealEls.forEach(el => revealObserver.observe(el));

/* =========================================
   SCROLLSPY — active nav link
   ========================================= */
const sections  = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-links a');

const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}, {
  threshold: 0.35,
  rootMargin: '-80px 0px -35% 0px'
});

sections.forEach(s => spyObserver.observe(s));

/* =========================================
   STICKY CTA — show after hero, hide near contact
   ========================================= */
const stickyCta  = document.getElementById('sticky-cta');
const heroSection    = document.getElementById('home');
const contactSection = document.getElementById('contact');

if (stickyCta && heroSection && contactSection) {
  const ctaObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.target === heroSection) {
        if (!entry.isIntersecting) {
          stickyCta.classList.add('visible');
          stickyCta.removeAttribute('aria-hidden');
        } else {
          stickyCta.classList.remove('visible');
          stickyCta.setAttribute('aria-hidden', 'true');
        }
      }
      if (entry.target === contactSection && entry.isIntersecting) {
        stickyCta.classList.remove('visible');
        stickyCta.setAttribute('aria-hidden', 'true');
      }
    });
  }, { threshold: 0.1 });

  ctaObserver.observe(heroSection);
  ctaObserver.observe(contactSection);

  // Hide when clicking sticky CTA link (navigates to contact)
  stickyCta.querySelector('a').addEventListener('click', () => {
    stickyCta.classList.remove('visible');
  });
}

/* =========================================
   ATTRIBUTION — carry the traffic source into WhatsApp

   WhatsApp is the only conversion point, and an outbound click tells us
   nothing about which ad produced it. So we remember the ad click id on
   landing, stamp a short code into the prefilled message, and attach both
   to every tracked event. A message that arrives with "#K7M2Q" can then be
   traced back to its gclid in PostHog / GA4 and, if the lead closes,
   uploaded to Google Ads as an offline conversion.
   ========================================= */
const attribution = (() => {
  const KEY  = 'assem_attr';
  const TTL  = 90 * 24 * 60 * 60 * 1000;                 // Google Ads click window
  const IDS  = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'yclid'];
  const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const KEYS = IDS.concat(UTMS);
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I — codes get retyped by hand

  const load = () => {
    try {
      const rec = JSON.parse(localStorage.getItem(KEY));
      return rec && rec.code && Date.now() - rec.ts < TTL ? rec : null;
    } catch (e) { return null; }
  };

  const save = (rec) => {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* private mode */ }
  };

  const newCode = () => {
    const bytes = new Uint8Array(5);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('');
  };

  const query = new URLSearchParams(location.search);
  const arrived = {};
  KEYS.forEach((k) => {
    const v = query.get(k);
    if (v) arrived[k] = v.slice(0, 200);
  });

  // A fresh ad click always wins over what we stored — same last-touch rule Google Ads uses
  let record = load();
  if (Object.keys(arrived).length || !record) {
    record = Object.assign({ code: newCode(), ts: Date.now(), landing: location.pathname }, arrived);
    if (!Object.keys(arrived).length && document.referrer && !document.referrer.includes(location.host)) {
      try { record.referrer = new URL(document.referrer).hostname; } catch (e) { /* opaque referrer */ }
    }
    save(record);
  }

  const props = () => {
    const out = { lead_code: record.code };
    KEYS.forEach((k) => { if (record[k]) out[k] = record[k]; });
    if (record.referrer) out.referrer_host = record.referrer;
    return out;
  };

  // Prefill the message so the code reaches the inbox. Built by hand rather than
  // URLSearchParams — wa.me wants %20, not "+", or the pluses show up in the chat.
  const message = `Здравствуйте! Хочу узнать цену на дизайн интерьера. (#${record.code})`;
  document.querySelectorAll('a[href*="wa.me"]').forEach((a) => {
    if (a.href.includes('text=')) return;
    a.href += (a.href.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(message);
  });

  return { code: record.code, props };
})();

window.__attr = attribution;

/* Wave animation is static — CSS wavesDrift handles motion via GPU-composited transform */
