/* =========================================
   PHONE STORIES — Instagram-style player
   Plays while it is on screen; tap right / left for next / previous, swipe
   sideways to do the same, press and hold to pause. Vertical scrolling stays
   the page's. Each slide's canvas is 360×600, scaled to fit between the top
   bar and the reply bar.
   ========================================= */
(() => {
  const root = document.querySelector('.stories');
  if (!root) return;

  const frame  = root.querySelector('.st-frame');
  const slides = [...root.querySelectorAll('.st-slide')];
  const bars   = [...root.querySelectorAll('.st-bars s')];
  const pause  = root.querySelector('.st-pause');
  const like   = root.querySelector('.st-like');
  const still  = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOP = 64, BOTTOM = 76;                 // room for the top bar and the reply bar

  const project = document.querySelector('.project-hero h1').textContent;
  const seen = new Set();
  function track(ev, props = {}) {
    const key = ev + (props.slide || '');
    if (ev !== 'story_like' && seen.has(key)) return;
    seen.add(key);
    const p = Object.assign({ project, placement: 'stories' }, window.__attr && window.__attr.props(), props);
    if (window.posthog) posthog.capture(ev, p);
    if (window.gtag) gtag('event', ev, p);
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p));
  }

  let i = 0, elapsed = 0, last = 0, raf = 0;
  let onScreen = false, held = false, paused = still;   // reduced motion: no autoplay, taps only
  let waiting = false;                                   // the active slide's photos are still on their way

  // Photos load ahead of the viewer: the next few slides at once, the rest once the
  // stories have been on screen for a moment
  const imgsOf = (s) => [...s.querySelectorAll('img')];
  const warm = (from, count = slides.length) => slides.slice(from, from + count)
    .forEach((s) => imgsOf(s).forEach((img) => { if (img.loading === 'lazy') img.loading = 'eager'; }));
  let warmedAll = false;

  function fit() {
    const w = frame.clientWidth, h = frame.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / 360, (h - TOP - BOTTOM) / 600);
    root.style.setProperty('--k', k.toFixed(4));
    root.style.setProperty('--cy', (TOP + (h - TOP - BOTTOM) / 2).toFixed(1) + 'px');
    // Picture slides (9:16): as big as fits, bottom clear of the reply bar; the top 8% is
    // empty paper in Assem's template, so that much may sit under the progress bars
    const SLIP = 0.08;
    const ph = Math.min(w * 16 / 9, (h - TOP - BOTTOM) / (1 - SLIP));
    const lo = TOP - ph * SLIP, hi = h - BOTTOM;
    root.style.setProperty('--ph', ph.toFixed(1) + 'px');
    root.style.setProperty('--pw', (ph * 9 / 16).toFixed(1) + 'px');
    root.style.setProperty('--pt', (lo + (hi - lo - ph) / 2).toFixed(1) + 'px');
  }

  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    elapsed = 0;
    slides.forEach((s, j) => {
      s.classList.toggle('is-active', j === i);
      s.setAttribute('aria-hidden', String(j !== i));
    });
    bars.forEach((b, j) => { b.style.transform = `scaleX(${j < i ? 1 : 0})`; });
    if (root.offsetWidth) warm(i, 4);
    // A slide whose photos haven't arrived waits — entrance animations and the timer hold —
    // and then opens whole instead of piece by piece. Never longer than 4 s.
    const slide = slides[i], mine = i;
    const pending = imgsOf(slide).filter((img) => !img.complete);
    waiting = pending.length > 0;
    slides.forEach((s) => s.classList.toggle('is-waiting', s === slide && waiting));
    if (waiting) {
      Promise.race([
        Promise.all(pending.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {}))),
        new Promise((r) => setTimeout(r, 4000)),
      ]).then(() => {
        if (i !== mine) return;
        waiting = false;
        slide.classList.remove('is-waiting');
        run();
      });
    }
    if (onScreen) track('story_slide_view', { slide: i + 1, slide_name: slides[i].dataset.name });
    if (i === slides.length - 1 && onScreen) track('story_complete');
  }

  const playing = () => onScreen && !held && !paused && !waiting && !document.hidden;

  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(now - last, 100) : 0;
    last = now;
    if (!playing()) { last = 0; return; }
    elapsed += dt;
    const dur = (+slides[i].dataset.dur || 6) * 1000;
    bars[i].style.transform = `scaleX(${Math.min(1, elapsed / dur).toFixed(4)})`;
    if (elapsed >= dur) {
      if (i < slides.length - 1) show(i + 1);
      else { setPaused(true); return; }        // stays on the last slide
    }
    raf = requestAnimationFrame(tick);
  }
  function run() { if (!raf && playing()) { last = 0; raf = requestAnimationFrame(tick); } }

  function setPaused(v) {
    // Play after the last slide has run out starts over
    if (!v && i === slides.length - 1 && elapsed >= (+slides[i].dataset.dur || 6) * 1000) show(0);
    paused = v;
    root.classList.toggle('is-paused', v);
    pause.setAttribute('aria-label', v ? 'Смотреть' : 'Пауза');
    run();
  }

  const next = () => { if (i < slides.length - 1) show(i + 1); else bars[i].style.transform = 'scaleX(1)'; run(); };
  const prev = () => { show(i - 1); run(); };

  // ---------- Gestures ----------
  let down = null, holdTimer = 0;
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button') || !e.isPrimary) return;
    down = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => { held = true; root.classList.add('is-held'); }, 220);
  });
  frame.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) clearTimeout(holdTimer);
  });
  const release = () => {
    clearTimeout(holdTimer);
    const was = held;
    held = false;
    root.classList.remove('is-held');
    run();
    return was;
  };
  frame.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    const wasHeld = release();
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { dx < 0 ? next() : prev(); return; }
    if (wasHeld || Math.hypot(dx, dy) > 12) return;
    const r = frame.getBoundingClientRect();
    (e.clientX - r.left < r.width * 0.3) ? prev() : next();
  });
  frame.addEventListener('pointercancel', () => { down = null; release(); });   // the page took over to scroll
  frame.addEventListener('contextmenu', (e) => e.preventDefault());

  root.querySelector('.st-next').addEventListener('click', next);
  root.querySelector('.st-prev').addEventListener('click', prev);
  pause.addEventListener('click', () => setPaused(!paused));

  like.addEventListener('click', () => {
    const on = like.getAttribute('aria-pressed') !== 'true';
    like.setAttribute('aria-pressed', String(on));
    if (on) track('story_like', { slide: i + 1 });
  });

  // ---------- Play only while most of it is on screen ----------
  new IntersectionObserver(([entry]) => {
    const was = onScreen;
    onScreen = entry.intersectionRatio >= 0.6;
    if (onScreen && !was) track('story_slide_view', { slide: i + 1, slide_name: slides[i].dataset.name });
    if (entry.isIntersecting && !warmedAll) { warmedAll = true; setTimeout(() => warm(0), 1500); }
    run();
  }, { threshold: [0, 0.6, 1] }).observe(frame);
  document.addEventListener('visibilitychange', run);

  root.classList.add('is-live');
  root.classList.toggle('is-paused', paused);
  fit();
  show(0);
  addEventListener('resize', fit);
})();
