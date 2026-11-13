/* =========================================
   PROJECT PAGE — masonry, lightbox, share, mobile dock
   ========================================= */
(() => {
  const grid     = document.querySelector('.project-grid');
  const pictures = [...grid.children];                       // photo order, before masonry reshuffles the DOM
  const imgs     = pictures.map((p) => p.querySelector('img'));

  /* MASONRY — each photo joins the currently shortest column. Heights come from the
     width/height attributes, so the layout is final before any image has loaded. */
  let cols = 0;

  function layout() {
    const n = parseInt(getComputedStyle(grid).getPropertyValue('--cols'), 10) || 3;
    if (n === cols) return;
    cols = n;
    const columns = Array.from({ length: n }, () => Object.assign(document.createElement('div'), { className: 'project-col' }));
    const heights = new Array(n).fill(0);
    pictures.forEach((pic, i) => {
      const col = heights.indexOf(Math.min(...heights));
      columns[col].append(pic);
      heights[col] += imgs[i].getAttribute('height') / imgs[i].getAttribute('width') + 0.05;   // + the gap
    });
    grid.replaceChildren(...columns);
  }

  layout();
  addEventListener('resize', layout);

  /* LOOK-AHEAD — start photos about two screens before they scroll in. Safari's own
     lazy loading starts late, so a quick scroll on an iPhone outran it. */
  if ('IntersectionObserver' in window) {
    const ahead = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.loading = 'eager';
      ahead.unobserve(e.target);
    }), { rootMargin: '1600px 0px' });
    imgs.forEach((img) => ahead.observe(img));
  }

  /* LIGHTBOX */
  const lb        = document.getElementById('lb');
  const lbImg     = document.getElementById('lb-img');
  const lbClose   = document.getElementById('lb-close');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbCount   = document.getElementById('lb-counter');
  const lbProject = document.getElementById('lb-project');

  const project = document.querySelector('.project-hero h1').textContent;
  let current = 0;

  lbProject.textContent = project;

  function show(index) {
    current = (index + imgs.length) % imgs.length;
    // the grid may have picked a smaller copy (w480/, w960/); the lightbox shows the original
    lbImg.src = (imgs[current].currentSrc || imgs[current].src).replace(/\/w\d+\//, '/');
    lbImg.alt = imgs[current].alt;
    lbCount.textContent = `${current + 1} / ${imgs.length}`;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    const photoProps = Object.assign({ project, photo_index: current + 1 },
                                     window.__attr && window.__attr.props());
    if (window.posthog) posthog.capture('photo_view', photoProps);
    if (window.gtag) gtag('event', 'photo_view', photoProps);
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: 'photo_view' }, photoProps));
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  imgs.forEach((img, i) => img.addEventListener('click', () => show(i)));

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click', () => show(current - 1));
  lbNext.addEventListener('click', () => show(current + 1));

  // Close on backdrop click
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });

  // Touch swipe support
  let touchX = 0;
  lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend',   (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) dx < 0 ? show(current + 1) : show(current - 1);
  });

  /* SHARE — the system share sheet where there is one, otherwise copy the link.
     The share sheet and the Clipboard API exist only on https; the old copy command
     still works on plain http (a test link on the local network) and in in-app
     browsers that block both. If nothing can copy, the link is shown to copy by hand. */
  const copyOld = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';   // 16px: iOS doesn't zoom in
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);                                          // iOS
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* not allowed */ }
    ta.remove();
    return ok;
  };
  document.querySelectorAll('[data-share]').forEach((btn) => btn.addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); return; }
      catch (e) { if (e.name === 'AbortError') return; }                          // closed the sheet
    }
    let ok;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { ok = copyOld(url); }
    if (!ok) { prompt('Ссылка на проект', url); return; }
    btn.setAttribute('data-copied', '');
    setTimeout(() => btn.removeAttribute('data-copied'), 1800);
  }));

  /* DOCK — mobile action bar, shown between the cover and the contact footer,
     and kept out of the way while a scroll story has the screen */
  const dock    = document.querySelector('.project-dock');
  const hero    = document.querySelector('.project-hero');
  const contact = document.getElementById('contact');
  const story   = document.getElementById('story');

  if (dock && hero && contact) {
    const inView = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inView.add(e.target) : inView.delete(e.target)));
      dock.classList.toggle('visible', inView.size === 0);
    });
    [hero, contact, story].forEach((el) => el && io.observe(el));
  }
})();
