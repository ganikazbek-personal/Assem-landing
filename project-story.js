/* =========================================
   SCROLL STORY (desktop) — the whole plan; each zone opens into full-height renders
   Scroll position drives everything: progress is counted in screen heights
   ("units") from the top of .story. A zone lights up on the plan, its first
   render grows out of the zone's outline to full height, numbered notes pin
   themselves to the photo one by one (and light up in the panel), the next
   render takes over, and at the end the photo folds back into the plan.
   Phones get project-stories.js instead.
   ========================================= */
(() => {
  const story = document.querySelector('.story');
  if (!story || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 900px)').matches) return;

  const stage  = story.querySelector('.story-stage');
  const plan   = story.querySelector('.story-plan');
  const svg    = plan.querySelector('svg');
  const mini   = story.querySelector('.story-mini');
  const intro  = story.querySelector('.story-intro');
  const outro  = story.querySelector('.story-outro');
  const count  = story.querySelector('.story-hud-count b');
  const where  = story.querySelector('.story-hud-count i');
  const hint   = story.querySelector('.story-hint');
  const shapes = [...svg.querySelectorAll('.story-shape')];
  const labels = [...svg.querySelectorAll('.story-label')];
  const minis  = [...mini.querySelectorAll('.story-mini-zone')];

  // Timeline, in screen heights of scroll
  const INTRO = 1, OUTRO = 1.2;
  const LIGHT = 0.3, OPEN = 0.4, CLOSE = 0.4;   // per zone
  const SHOT = 0.35, FADE = 0.2, NOTE = 0.32;   // per photo, per note

  let at = INTRO;
  const zones = [...story.querySelectorAll('.story-zone')].map((el, i) => {
    const pins  = [...el.querySelectorAll('.story-pins')];
    const lists = [...el.querySelectorAll('.story-list')];
    const blurs = [...el.querySelectorAll('.story-blur')];
    const shots = [...el.querySelectorAll('.story-frame img')].map((img, j) => ({
      img,
      blur:  blurs[j],
      pins:  pins[j],
      list:  lists[j],
      notes: [...pins[j].querySelectorAll('.story-pin')].map((pin, k) => ({ pin, item: lists[j].children[k] })),
    }));
    const z = { el, i, name: el.dataset.name, frame: el.querySelector('.story-frame'), blurs: el.querySelector('.story-blurs'),
                copy: el.querySelector('.story-copy'), shots, shape: shapes[i], label: labels[i], mini: minis[i] };
    z.start = at;
    let t = LIGHT + OPEN;
    shots.forEach((s) => { s.at = t; t += SHOT + s.notes.length * NOTE; });
    z.len = t + CLOSE;
    at += z.len;
    return z;
  });
  const END = at, TOTAL = END + OUTRO;

  // How far people get: each zone once, and the end of the story
  const project = document.querySelector('.project-hero h1').textContent;
  const seen = new Set();
  function track(ev, props) {
    const key = ev + (props.zone || '');
    if (seen.has(key)) return;
    seen.add(key);
    const p = Object.assign({ project }, window.__attr && window.__attr.props(), props);
    if (window.posthog) posthog.capture(ev, p);
    if (window.gtag) gtag('event', ev, p);
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p));
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease  = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span  = (t, from, len) => clamp((t - from) / len);
  const mix   = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

  let W = 0, H = 0;

  // Picture area left of the panel
  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!H) return;                                    // hidden (window narrowed to phone size)
    const panelW = Math.round(clamp(W * 0.3, 380, 460));
    const viewW = W - panelW;
    stage.style.setProperty('--panel-w', panelW + 'px');
    stage.style.setProperty('--view-w', viewW + 'px');
    stage.style.setProperty('--view-h', H + 'px');

    const box = { x: 56, y: 72, w: viewW - 112, h: H - 168 };
    Object.assign(plan.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
    const vb = svg.viewBox.baseVal;
    svg.style.setProperty('--px', (1 / Math.min(box.w / vb.width, box.h / vb.height)).toFixed(4));

    const s = stage.getBoundingClientRect();
    zones.forEach((z) => {
      const r = z.shape.getBoundingClientRect();
      z.from = { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
      // Each render whole, as tall as the picture area allows
      z.shots.forEach((sh) => {
        const a = sh.img.getAttribute('width') / sh.img.getAttribute('height');
        const h = Math.min(H, viewW / a), w = h * a;
        sh.rect = { x: (viewW - w) / 2, y: (H - h) / 2, w, h };
      });
    });
  }

  function place(el, r) {
    el.style.left = r.x.toFixed(1) + 'px';
    el.style.top = r.y.toFixed(1) + 'px';
    el.style.width = r.w.toFixed(1) + 'px';
    el.style.height = r.h.toFixed(1) + 'px';
  }

  function render() {
    if (!H) return;
    const p = -story.getBoundingClientRect().top / H;      // units scrolled into the story

    // Drawing appears while the sheet slides in
    const draw = clamp((p + 0.8) / 1.3);
    story.style.setProperty('--draw', draw.toFixed(3));
    story.classList.toggle('is-drawn', draw >= 1);
    story.style.setProperty('--progress', clamp(p / TOTAL).toFixed(4));

    intro.style.opacity = (1 - span(p, INTRO - 0.2, 0.2)).toFixed(3);
    const out = span(p, END + 0.15, 0.35);
    outro.style.opacity = out.toFixed(3);
    outro.style.visibility = out > 0 ? 'visible' : 'hidden';

    let active = null, view = 0, shotNo = 0;

    zones.forEach((z) => {
      const t = p - z.start;
      const on = t >= 0 && t < z.len;
      z.el.classList.toggle('is-on', on);

      const lit = on ? Math.min(span(t, 0, LIGHT * 0.8), 1 - span(t, z.len - 0.15, 0.15)) : p >= END ? 0.6 * span(p, END, 0.4) : 0;
      z.shape.style.fillOpacity = (lit * 0.18).toFixed(3);
      z.shape.style.strokeOpacity = lit.toFixed(3);
      z.label.style.opacity = (on ? 1 : 0.45 * draw).toFixed(3);
      z.label.classList.toggle('is-active', on);
      z.mini.classList.toggle('is-active', on);
      if (!on) return;
      active = z;

      z.copy.style.opacity = (span(t, 0, 0.2) * (1 - span(t, z.len - 0.2, 0.2))).toFixed(3);

      // Out of the zone's outline to full height, and back at the end
      const open = ease(span(t, LIGHT, OPEN));
      const close = ease(span(t, z.len - CLOSE, CLOSE));
      view = open * (1 - close);
      z.blurs.style.opacity = view.toFixed(3);

      // Photos one after another; the frame takes the shape of whichever is on top
      let rect = z.shots[0].rect, current = 0;
      z.shots.forEach((sh, j) => {
        const f = j === 0 ? 1 : ease(span(t, sh.at, FADE));
        sh.img.style.opacity = f.toFixed(3);
        sh.blur.style.opacity = f.toFixed(3);
        if (j > 0 && f > 0) rect = mix(rect, sh.rect, f);
        if (f >= 0.5) current = j;
      });
      place(z.frame, mix(mix(z.from, rect, open), z.from, close));
      z.frame.style.opacity = Math.min(span(t, LIGHT, 0.08), 1 - span(t, z.len - 0.08, 0.08)).toFixed(3);
      shotNo = current;

      // Notes of the current photo: each pins itself in turn; the newest one is "active"
      z.shots.forEach((sh, j) => {
        const live = j === current && view > 0.98;
        sh.pins.classList.toggle('is-on', live);
        sh.list.classList.toggle('is-on', j === current);
        let newest = -1;
        sh.notes.forEach((n, k) => {
          const v = live ? ease(span(t, sh.at + 0.08 + (j === 0 ? 0 : FADE) + k * NOTE, 0.14)) : 0;
          n.pin.style.opacity = v.toFixed(3);
          n.pin.style.transform = `scale(${(0.6 + 0.4 * v).toFixed(3)})`;
          if (v > 0.5) newest = k;
          n.item.classList.toggle('is-seen', v > 0.5);
        });
        sh.notes.forEach((n, k) => {
          n.pin.classList.toggle('is-active', k === newest);
          n.item.classList.toggle('is-active', k === newest);
        });
      });
      z.copy.classList.toggle('show-specs', view < 0.5 || z.shots[current].notes.length === 0);
      z.copy.classList.toggle('is-viewing', view > 0.5);
    });

    plan.style.opacity = (1 - view).toFixed(3);
    mini.style.opacity = view.toFixed(3);
    story.classList.toggle('is-covered', view > 0.5);

    if (active) track('story_zone_view', { zone: active.i + 1, zone_name: active.name });
    if (p >= END + 0.3) track('story_complete', {});

    count.textContent = active ? String(active.i + 1).padStart(2, '0') : '00';
    where.textContent = active
      ? (view > 0.5 ? `${active.name} · фото ${shotNo + 1}/${active.shots.length}` : active.name)
      : p >= END ? 'Вся квартира' : 'Вход';
    hint.style.opacity = p < INTRO ? '1' : p < END - 0.3 ? '.7' : '0';
    hint.textContent = p < INTRO ? 'Прокрутите, чтобы войти' : 'Прокрутите дальше';
  }

  story.style.setProperty('--story-length', TOTAL + 1);
  story.classList.add('is-live');
  measure();
  render();

  let queued = false;
  const frame = () => { queued = false; render(); };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(frame); } }, { passive: true });
  addEventListener('resize', () => { measure(); render(); });
})();
