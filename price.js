/* =========================================
   PRICE PAGE — /price
   Chat bubbles arriving as they scroll in, photo carousels, render/photo
   sliders, the area calculator (its WhatsApp message carries the area and the
   lead code) and analytics. Runs after script.js, which sets window.__attr.
   ========================================= */
(() => {
  const WHATSAPP = 'https://wa.me/77000371717';

  const track = (ev, props) => {
    const p = Object.assign({ page: 'price' }, window.__attr && window.__attr.props(), props);
    if (window.posthog) posthog.capture(ev, p);
    if (window.gtag) gtag('event', ev, p);
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p));
  };
  const once = new Set();
  const trackOnce = (ev, props, key = ev) => { if (!once.has(key)) { once.add(key); track(ev, props); } };

  /* BACK — ← returns to the page of this site the visitor came from (a project's
     «Хочу так же!», the gallery); straight from an ad or a link it goes home */
  const back = document.querySelector('.chat-head .back');
  let cameFrom = '';
  try { cameFrom = new URL(document.referrer).origin; } catch (e) { /* no referrer */ }
  if (back && cameFrom === location.origin && history.length > 1) {
    back.setAttribute('aria-label', 'Назад');
    back.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
  }

  /* CHAT — bubbles arrive one after another as they scroll into view */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal');
    let queue = [], timer = 0;
    const flush = () => {
      const el = queue.shift();
      if (el) el.classList.add('is-in');
      timer = queue.length ? setTimeout(flush, 140) : 0;
    };
    const io = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((e) => { queue.push(e.target); io.unobserve(e.target); });
      if (!timer) flush();
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.feed > .msg').forEach((m) => io.observe(m));
  }

  /* CAROUSELS — swipe, arrows, counter and dots */
  document.querySelectorAll('.carousel').forEach((c) => {
    const rail = c.querySelector('.track');
    const slides = [...rail.children];
    const count = c.querySelector('.count');
    const dots = document.createElement('div');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = slides.map(() => '<i></i>').join('');
    c.append(dots);
    const idx = () => Math.round(rail.scrollLeft / rail.clientWidth);
    const go = (i) => rail.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * rail.clientWidth, behavior: 'smooth' });
    const sync = () => {
      const i = idx();
      count.textContent = (i + 1) + ' / ' + slides.length;
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
      if (i > 0) trackOnce('carousel_swipe', { carousel: c.getAttribute('aria-label') }, 'car:' + c.getAttribute('aria-label'));
    };
    c.querySelector('.prev').addEventListener('click', () => go(idx() - 1));
    c.querySelector('.next').addEventListener('click', () => go(idx() + 1));
    rail.addEventListener('scroll', sync, { passive: true });
    sync();
  });

  /* RENDER ↔ PHOTO — drag the range, or the photo itself */
  document.querySelectorAll('.msg .ba').forEach((ba) => {
    const range = ba.closest('.msg').querySelector('input[type=range]');
    const before = ba.querySelector('.before');
    const line = ba.querySelector('.line');
    const label = ba.closest('.msg').querySelector('.ba-ctl b').textContent;
    const set = () => {
      before.style.clipPath = 'inset(0 ' + (100 - range.value) + '% 0 0)';
      line.style.left = range.value + '%';
    };
    const used = () => trackOnce('ba_slider_used', { slider: label }, 'ba:' + label);
    range.addEventListener('input', () => { set(); used(); });

    // Horizontal drags move the divider; vertical ones still scroll the page (touch-action: pan-y)
    let start = null;
    const fromX = (x) => {
      const r = ba.getBoundingClientRect();
      range.value = Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100);
      set();
    };
    ba.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, moved: false }; });
    ba.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!start.moved && Math.abs(e.clientX - start.x) > 6 && Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y)) {
        start.moved = true;
        ba.setPointerCapture(e.pointerId);
      }
      if (start.moved) fromX(e.clientX);
    });
    const end = (e) => {
      if (start && !start.moved && e.type === 'pointerup') fromX(e.clientX);   // a tap jumps the divider there
      if (start && (start.moved || e.type === 'pointerup')) used();
      start = null;
    };
    ba.addEventListener('pointerup', end);
    ba.addEventListener('pointercancel', end);
    set();
  });

  /* CALCULATOR — area → estimate; the WhatsApp message carries area + lead code */
  const range = document.getElementById('area');
  if (range) {
    const out = document.getElementById('area-out');
    const sum = document.getElementById('area-sum');
    const cta = document.getElementById('calc-cta');
    const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const update = () => {
      const a = +range.value;
      out.textContent = a + ' м²';
      sum.textContent = 'от ' + fmt(a * 20000) + ' ₸';
      const code = window.__attr ? ' (#' + window.__attr.code + ')' : '';
      const msg = 'Здравствуйте, Асем! Хочу узнать точную цену дизайн-проекта. Площадь объекта: ' + a + ' м²' + code;
      cta.href = WHATSAPP + '?text=' + encodeURIComponent(msg);
    };
    range.addEventListener('input', () => { update(); trackOnce('price_calc_used', {}); });
    update();
  }

  /* FAQ — which questions people open */
  document.querySelectorAll('.faq-list details').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (d.open) trackOnce('faq_open', { question: d.querySelector('summary').textContent }, 'faq:' + d.querySelector('summary').textContent);
    });
  });

  /* How far down the page people get */
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      trackOnce('price_section_view', { section: e.target.dataset.section }, 'sec:' + e.target.dataset.section);
      seen.unobserve(e.target);
    }), { threshold: 0.4 });
    [['.typing', 'chat_end'], ['#price', 'price'], ['#faq', 'faq'], ['#contact', 'contact']].forEach(([sel, name]) => {
      const el = document.querySelector(sel);
      if (el) { el.dataset.section = name; seen.observe(el); }
    });
  }

  /* Clicks */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) {
      if (btn.classList.contains('nav-hamburger'))    track('menu_open', {});
      if (btn.classList.contains('nav-drawer-close')) track('menu_close', {});
      return;
    }
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const placement = a.dataset.placement || (a.closest('.nav-drawer') ? 'mobile_menu' : a.closest('.chat-head') ? 'header' : a.closest('.pinned') ? 'pinned' : 'other');
    if (href.includes('wa.me'))              track('contact_click', { channel: 'whatsapp', placement });
    else if (href.includes('instagram.com')) track('contact_click', { channel: 'instagram', placement });
    else if (href.includes('t.me'))          track('contact_click', { channel: 'telegram', placement });
    else if (href.startsWith('#'))           track('nav_click', { item: href.slice(1) || 'top', placement });
    else if (href === '/' || href === '/gallery') track('nav_click', { item: href === '/' ? 'home' : 'gallery', placement });
  });
})();
