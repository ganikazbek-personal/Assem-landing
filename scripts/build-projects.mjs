/*
 * Builds one static page per project — projects/<slug>.html, served as
 * /projects/<slug> — and refreshes the project cards on /gallery.
 *
 * Vercel has no build step for this site: run it locally after editing
 * PROJECTS or adding photos, and commit the generated HTML.
 *
 *   node scripts/build-projects.mjs
 *
 * Photos are picked up from projects/<slug>/NN.jpg, with NN.avif beside each, and the
 * smaller copies from scripts/make-variants.py (w480/, w960/) — run that first:
 *
 *   python3 scripts/make-variants.py && node scripts/build-projects.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://assem.design';
const WHATSAPP = 'https://wa.me/77000371717';

// Order is the card order on /gallery and the "next project" chain.
// description and facts are optional and only render when filled in, e.g.
//   description: 'Квартира для семьи с двумя детьми…',
//   facts: [['Площадь', '86 м²'], ['Год', '2025']],
// story: true adds phone-only stories from scripts/stories/<slug>.mjs between the cover and
// the photos: drawn from the zones (amore), or, when the file lists `images`, Assem's
// ready-made stories played as they are (eclat). Desktop goes straight to the photos.
// scroll: true also brings back the desktop scroll story (plan → zones) for a zones story.
const PROJECTS = [
  { slug: 'amore',       name: 'Amore',         kind: 'Квартира',       city: 'Астана', seo: 'дизайн квартиры в Астане', cover: '05', story: true },
  { slug: 'eclat',       name: 'Éclat',         kind: 'Квартира',       city: 'Астана', seo: 'дизайн интерьера квартиры в Астане', story: true },
  { slug: 'olive',       name: 'Olive',         kind: null,             city: 'Астана', seo: 'современный дизайн интерьера в Астане' },
  { slug: 'bluebby',     name: 'Bluebby',       kind: 'Квартира',       city: 'Астана', seo: 'дизайн интерьера квартиры в Астане' },
  { slug: 'medvedevo',   name: 'Medvedevo',     kind: 'Загородный дом', city: 'Москва', seo: 'дизайн интерьера загородного дома в Москве' },
  // Chic's AVIFs don't decode in Chrome (see git log for projects/chic) — serve its WebPs instead
  { slug: 'chic',        name: 'Chic',          kind: 'Квартира',       city: null,     seo: 'дизайн интерьера квартиры', format: 'webp' },
  { slug: 'lemon',       name: 'Lemon',         kind: 'Квартира',       city: 'Алматы', seo: 'дизайн квартиры в Алматы' },
  { slug: 'withlovewro', name: 'With Love WRO', kind: null,             city: null,     seo: 'дизайн интерьера' },
];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Width/height from the JPEG's SOF marker — enough to tell landscape shots from portrait ones
function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`No JPEG size in ${file}`);
}

// DRAWN_STORIES=1 builds the drawn (HTML) stories even where pictures exist — the source
// scripts/render-stories.mjs turns into those pictures
const DRAWN = Boolean(process.env.DRAWN_STORIES);
const drawnStories = (p) => !p.story.images || (DRAWN && Boolean(p.story.zones));

// Widths of the smaller copies made by scripts/make-variants.py
const VARIANTS = [480, 960];

// `format` is the lighter sibling served ahead of the JPG, when the file exists;
// `widths` are the smaller copies of it that exist
function photosOf(slug, format = 'avif') {
  const dir = path.join(ROOT, 'projects', slug);
  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.jpg$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((f) => {
      const id = f.slice(0, -4);
      const { w, h } = jpegSize(path.join(dir, f));
      const modern = fs.existsSync(path.join(dir, `${id}.${format}`)) ? format : null;
      const widths = modern ? VARIANTS.filter((v) => v < w && fs.existsSync(path.join(dir, `w${v}`, `${id}.${format}`))) : [];
      const thumb = fs.existsSync(path.join(dir, 'w480', `${id}.jpg`));
      const tiny = path.join(dir, 'w24', `${id}.jpg`);
      const lqip = fs.existsSync(tiny) ? `data:image/jpeg;base64,${fs.readFileSync(tiny).toString('base64')}` : null;
      return { id, w, h, modern, widths, thumb, lqip };
    });
}

// `sizes` (how wide the image shows) lets the browser pick a smaller copy;
// without it only the original is offered. `cap` leaves the original out, for images
// under a dark overlay (cards, the next-project cover) where 960px is plenty even on
// a 3× phone screen that would otherwise ask for the full file.
function pic(slug, ph, { alt, cls = '', eager = false, sizes = null, cap = false }, pad) {
  const src = `/projects/${slug}/${ph.id}`;
  const capped = cap && ph.widths.includes(960);
  const set = sizes && ph.widths.length
    ? `srcset="${[...ph.widths.map((v) => `/projects/${slug}/w${v}/${ph.id}.${ph.modern} ${v}w`), ...(capped ? [] : [`${src}.${ph.modern} ${ph.w}w`])].join(', ')}" sizes="${sizes}"`
    : `srcset="${src}.${ph.modern}"`;
  return [
    `<picture${cls ? ` class="${cls}"` : ''}>`,
    ph.modern && `  <source ${set} type="image/${ph.modern}">`,
    // a blurry inline preview shows until the photo arrives — the cover too, so a phone
    // on a slow connection sees the room at once instead of a dark screen
    `  <img src="${src}.jpg" alt="${esc(alt)}" width="${ph.w}" height="${ph.h}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${ph.lqip ? ` style="background: url(${ph.lqip}) 50% / cover no-repeat"` : ''}>`,
    '</picture>',
  ].filter(Boolean).map((line) => pad + line).join('\n');
}

// Line icons, 24×24, drawn in currentColor
const ICON = {
  down:  '<path d="M12 4v16M6 14l6 6 6-6"/>',
  share: '<path d="M14 5l6 6-6 6"/><path d="M20 11h-7a9 9 0 0 0-9 9"/>',
  chat:  '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.55L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
  grid:  '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

// Tracking snippets come from index.html so the ids and keys live in one place
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fromIndex(start, end, { keepEnd = true } = {}) {
  const a = indexHtml.indexOf(start);
  const b = a < 0 ? -1 : indexHtml.indexOf(end, a);
  if (b < 0) throw new Error(`index.html: can't find "${start}" … "${end}"`);
  return indexHtml.slice(a, keepEnd ? b + end.length : b);
}
const TRACKING_HEAD = fromIndex('<!-- Google Tag Manager + Google tag (GA4) -->', '\n\n  <title>', { keepEnd: false });
const POSTHOG       = fromIndex('<!-- PostHog Analytics -->', '</script>');
const GTM_NOSCRIPT  = fromIndex('<!-- Google Tag Manager (noscript) -->', '<!-- End Google Tag Manager (noscript) -->');

// Scroll story: the whole plan stays put; each zone opens into its renders, full height,
// with numbered notes pinned on the photo and listed in the side panel
function storySection(p) {
  const s = p.story;
  const pad2 = (n) => String(n).padStart(2, '0');
  const raw = fs.readFileSync(path.join(ROOT, s.plan), 'utf8').trim();
  const viewBox = raw.match(/viewBox="([^"]+)"/)[1];
  const art = raw.slice(raw.indexOf('>') + 1, raw.lastIndexOf('</svg>'));
  const plan = [
    `<svg viewBox="${viewBox}" role="img" aria-label="План квартиры">`,
    `<g id="story-plan-art">${art}</g>`,
    '<g class="story-shapes">',
    ...s.zones.map((z) => `<path class="story-shape" d="${z.shape}"/>`),
    '</g>\n<g class="story-labels">',
    ...s.zones.map((z) => `<g class="story-label" transform="translate(${z.label[0]} ${z.label[1]})"><text class="story-label-name" dy="-.1em">${esc(z.short.toUpperCase())}</text><text class="story-label-area" dy="1.3em">${esc(z.area)}</text></g>`),
    '</g>\n</svg>',
  ].join('\n');
  // Where-am-I map while a zone's photos fill the screen: the same drawing, reused
  const mini = `<svg class="story-mini" viewBox="${viewBox}" aria-hidden="true"><use href="#story-plan-art"/>${s.zones.map((z) => `<path class="story-mini-zone" d="${z.shape}"/>`).join('')}</svg>`;

  const zones = s.zones.map((z, i) => {
    const shots = z.photos.map((sh) => (typeof sh === 'string' ? { id: sh, notes: [] } : { notes: [], ...sh })).map((sh) => {
      const ph = p.photos.find((x) => x.id === sh.id);
      if (!ph) throw new Error(`${p.slug} story: photo ${sh.id} not found`);
      return { ...sh, ph };
    });
    const blurs = shots.map(({ ph }) => {
      // blurred backdrop: the 480px copy is plenty
      const src = `/projects/${p.slug}/${ph.thumb ? 'w480/' : ''}${ph.id}`;
      const modern = ph.widths.includes(480) || !ph.thumb ? ph.modern : null;
      const set = modern ? `; background-image: image-set(url(${src}.${modern}) type('image/${modern}'), url(${src}.jpg) type('image/jpeg'))` : '';
      return `        <div class="story-blur" style="background-image: url(${src}.jpg)${set}"></div>`;
    }).join('\n');
    const photos = shots.map(({ ph }, j) => pic(p.slug, ph, { alt: `${p.name} — ${z.name.toLowerCase()}, фото ${j + 1}`, sizes: '(max-width: 900px) 100vw, 50vw' }, '        ')).join('\n');
    const pins = shots.map(({ notes }) => `        <div class="story-pins">${notes.map((n, k) => `
          <div class="story-pin" style="--x: ${n.x}%; --y: ${n.y}%"${n.x > 55 ? ' data-side="left"' : ''}><i>${k + 1}</i><span><b>${esc(n.title)}</b>${esc(n.text)}</span></div>`).join('')}
        </div>`).join('\n');
    const lists = shots.map(({ notes }) => `        <ol class="story-list">${notes.map((n) => `
          <li><b>${esc(n.title)}</b><span>${esc(n.text)}</span></li>`).join('')}
        </ol>`).join('\n');
    return `    <article class="story-zone" data-name="${esc(z.short)}">
      <div class="story-blurs" aria-hidden="true">
${blurs}
      </div>
      <div class="story-frame">
${photos}
${pins}
      </div>
      <div class="story-copy">
        <p class="story-kicker">Зона ${pad2(i + 1)} · ${esc(z.area)}</p>
        <h3>${esc(z.name)}</h3>
        <p class="story-text">${esc(z.text)}</p>
${lists}
        <dl class="story-specs">
${z.specs.map(([k, v]) => `          <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
        </dl>
      </div>
    </article>`;
  }).join('\n');

  return `
  <!-- STORY: scroll story on desktop, Instagram-style stories on phones -->
  <div id="story">
  <section class="story" aria-label="Квартира по зонам">
    <div class="story-stage">
    <div class="story-panel" aria-hidden="true"></div>
    <div class="story-plan">
${plan}
    </div>
    ${mini}
    <div class="story-copy story-intro">
      <p class="story-kicker">${esc(s.intro.kicker)} · ${esc(s.area)}</p>
      <h2>${esc(s.intro.title)}</h2>
      <p class="story-text">${esc(s.intro.text)}</p>
    </div>
${zones}
    <div class="story-copy story-outro">
      <h2>${esc(s.outro.title)}</h2>
      <p class="story-text">${esc(s.outro.text)} Ниже — все ${p.photos.length} фото проекта.</p>
      <a href="#photos">Смотреть все фото</a>
    </div>
    <div class="story-hud" aria-hidden="true">
      <span class="story-hud-tl">${esc(p.name)} — планировка</span>
      <span class="story-hud-tr">${esc(s.area)}<span class="story-hud-rooms"> · ${s.rooms} помещений</span></span>
      <span class="story-hud-count"><b>00</b> / ${pad2(s.zones.length)} · <i>Вход</i></span>
      <span class="story-hint">Прокрутите, чтобы войти</span>
      <div class="story-ruler"><i></i></div>
    </div>
    </div>
  </section>
${storiesSection(p)}
  </div>
`;
}

/* ---------- Phone stories: the same story as Instagram-style slides ----------
   Every slide is laid out on a 360×600 canvas (project-stories.js scales it to the
   screen), so positions below are canvas pixels. Look follows Assem's own stories:
   paper, handwriting, polaroids, drawn arrows. */
const CANVAS_W = 360;

// White, slightly rotated print with optional numbered pins on the photo
function polaroid(p, ph, { maxW, maxH, x, right, y, rot = 0, d = 0, notes = [], alt }) {
  const a = ph.w / ph.h;
  let w = maxW, h = maxW / a;
  if (h > maxH) { h = maxH; w = maxH * a; }
  w = Math.round(w); h = Math.round(h);
  const left = x ?? CANVAS_W - right - (w + 16);
  const pins = notes.map((n, k) => `<i class="st-pin" style="left: ${n.x}%; top: ${n.y}%; --d: ${(d + 0.55 + k * 0.4).toFixed(2)}s">${k + 1}</i>`).join('');
  const box = { x: left, y, w: w + 16, h: h + 16 };
  const html = `<figure class="st-polaroid st-in" style="left: ${left}px; top: ${y}px; --rot: ${rot}deg; --d: ${d}s">
          <div class="st-photo" style="width: ${w}px; height: ${h}px">
${pic(p.slug, ph, { alt, sizes: `${w + 40}px` }, '            ')}
            ${pins}
          </div>
        </figure>`;
  return { html, box };
}

// Hand-drawn arrow from (x1, y1) to (x2, y2), bowed sideways by `bend`
function arrow(x1, y1, x2, y2, { bend = 30, color = 'red', d = 0 } = {}) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx - ((y2 - y1) / len) * bend, cy = my + ((x2 - x1) / len) * bend;
  const ang = Math.atan2(y2 - cy, x2 - cx), head = 11;
  const h1 = [x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)];
  const h2 = [x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)];
  const f = (n) => n.toFixed(1);
  return `<path class="st-ink-${color}" style="--d: ${d}s" pathLength="1" d="M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}M${f(h1[0])} ${f(h1[1])}L${f(x2)} ${f(y2)}L${f(h2[0])} ${f(h2[1])}"/>`;
}
const arrows = (paths) => `<svg class="st-arrows" viewBox="0 0 360 600" aria-hidden="true">${paths.join('')}</svg>`;

const HEART = 'M100 172C44 128 9 96 10 57C11 27 36 9 61 10C82 11 95 25 100 43C105 25 119 11 139 10C164 9 189 27 190 57C191 96 156 128 100 172Z';

// The plan drawing as a standalone image, styled for a white card
function writePlanCard(p) {
  const raw = fs.readFileSync(path.join(ROOT, p.story.plan), 'utf8');
  const style = '<style>.pl-ink{fill:none;stroke:#2b2622;stroke-width:.6}.pl-line{fill:none;stroke:#8f887c;stroke-width:.45}'
    + '.pl-wall{fill:#3a3631}.pl-wall.pl-edge{stroke:#3a3631;stroke-width:.3}.pl-mask{fill:#fff}.pl-soft{fill:#efe9df}'
    + '.zone{fill:#b0503c;fill-opacity:.07;stroke:#b0503c;stroke-width:1.4;stroke-dasharray:5 4}</style>';
  const zones = p.story.zones.map((z) => `<path class="zone" d="${z.shape}"/>`).join('');
  const out = raw.replace(/(<svg[^>]*>)/, `$1${style}`).replace('</svg>', `${zones}</svg>`);
  const file = `projects/${p.slug}/plan-card.svg`;
  fs.writeFileSync(path.join(ROOT, file), out);
  return '/' + file;
}

function storiesSection(p) {
  const s = p.story, t = s.stories;
  const pad2 = (n) => String(n).padStart(2, '0');
  const N = s.zones.length;
  const photo = (id) => {
    const ph = p.photos.find((x) => x.id === id);
    if (!ph) throw new Error(`${p.slug} stories: photo ${id} not found`);
    return ph;
  };
  const shotsOf = (z) => z.photos.map((sh) => (typeof sh === 'string' ? { id: sh, notes: [] } : { notes: [], ...sh }));
  const head = (title, step, count, size = 40) => `
        <div class="st-head-block" style="left: 16px; top: 12px; width: 236px">
          <h2 class="st-title st-in" style="font-size: ${size}px">${esc(title)}</h2>${step ? `
          <p class="st-blue st-in" style="margin-top: 8px; --d: .1s">${esc(step)}</p>` : ''}
        </div>
        <p class="st-step st-in" style="right: 16px; top: 18px; --d: .15s">${esc(count)}</p>
        <p class="st-sign st-in" style="right: 16px; top: 50px; --d: .2s">Assem Danakhmet</p>`;

  const slides = [];

  // 1. Cover
  const cover = p.cover;
  slides.push({ name: 'Обложка', dur: 6, html: `
        <span class="st-blob" style="left: 6px; top: 30px; width: 348px; height: 236px"></span>
        <span class="st-blob" style="left: 50px; top: 300px; width: 270px; height: 190px"></span>
        <p class="st-sign st-in" style="left: 0; right: 0; top: 46px; text-align: center; font-size: 21px">Assem Danakhmet · ${esc(p.name)}</p>
        <h2 class="st-title st-in" style="left: 0; right: 0; top: 76px; text-align: center; font-size: 50px; --d: .1s">${t.title.map(esc).join('<br>')}</h2>
        <p class="st-dark st-in" style="left: 30px; right: 30px; top: 190px; text-align: center; font-size: 25px; --d: .25s">${esc(t.sub)}</p>
        <p class="st-formula st-in" style="left: 0; right: 0; top: 266px; --d: .4s"><span class="b">${esc(t.formula[0])}</span> + <span class="r">${esc(t.formula[1])}</span> + <span class="b">${esc(t.formula[2])}</span> = <span class="r">${esc(t.formula[3])}</span></p>
        <svg class="st-heart st-in" viewBox="0 0 200 182" style="left: 102px; top: 308px; width: 156px; --d: .55s" aria-hidden="true">
          <defs><clipPath id="st-heart-${p.slug}"><path d="${HEART}"/></clipPath></defs>
          <image href="/projects/${p.slug}/${cover.thumb ? 'w480/' : ''}${cover.id}.jpg" width="200" height="182" preserveAspectRatio="xMidYMid slice" clip-path="url(#st-heart-${p.slug})"/>
          <path class="st-ink-red" style="--d: .7s" pathLength="1" d="${HEART}"/>
        </svg>
        <p class="st-blue st-hand-big st-in" style="left: 22px; top: 322px; --rot: -9deg; --d: .8s">${esc(t.hello)}</p>
        <p class="st-red st-hand-mid st-in" style="right: 26px; top: 446px; --rot: -5deg; --d: 1s">${esc(t.love)}</p>
        <p class="st-dark st-in" style="left: 34px; right: 34px; top: 490px; text-align: center; font-size: 23px; --d: 1.15s">${esc(t.lead)}</p>
        <p class="st-red st-in" style="left: 0; right: 0; top: 548px; text-align: center; font-size: 24px; --d: 1.3s">листайте</p>
        ${arrows([arrow(92, 588, 150, 588, { bend: -3, d: 1.4 }), arrow(160, 588, 218, 588, { bend: 3, d: 1.55 }), arrow(228, 588, 286, 588, { bend: -3, d: 1.7 })])}` });

  // 2. Plan + room schedule
  const card = writePlanCard(p);
  const [vx, vy, vw, vh] = fs.readFileSync(path.join(ROOT, s.plan), 'utf8').match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const labels = s.zones.map((z) => `<span style="left: ${((z.label[0] - vx) / vw * 100).toFixed(1)}%; top: ${((z.label[1] - vy) / vh * 100).toFixed(1)}%">${esc(z.short)}</span>`).join('');
  const half = Math.ceil(s.schedule.length / 2);
  const col = (rows) => `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  slides.push({ name: 'Планировка', dur: 8, html: `${head('Планировка', '', 'Шаг 1', 46)}
        <p class="st-blue st-in" style="left: 16px; top: 74px; width: 330px; --d: .1s">${esc(t.plan)}</p>
        <span class="st-blob" style="left: 0; top: 130px; width: 360px; height: 290px"></span>
        <figure class="st-card st-plan st-in" style="left: 12px; top: 120px; width: 336px; --rot: -1.5deg; --d: .25s">
          <img src="${card}" alt="Планировка квартиры ${esc(p.name)}" width="${vw}" height="${vh}" loading="lazy" decoding="async">
          <div class="st-plan-labels">${labels}</div>
        </figure>
        <figure class="st-card st-table st-in" style="left: 20px; top: 400px; width: 320px; --rot: 1deg; --d: .5s">
          <figcaption>Экспликация помещений</figcaption>
          <div>${col(s.schedule.slice(0, half))}${col(s.schedule.slice(half))}</div>
        </figure>
        <p class="st-red st-hand-mid st-in" style="right: 18px; top: 566px; --rot: -3deg; --d: .8s">итого ${esc(s.area)}!</p>` });

  // 3. Two slides per zone: the main photo with its notes, then two more views
  s.zones.forEach((z, i) => {
    const [main, ...more] = shotsOf(z);
    const step = `Шаг ${i + 2} · ${z.area}`;
    const count = `${i + 1}/${N}`;
    const m = polaroid(p, photo(main.id), { maxW: 252, maxH: 286, x: 14, y: 134, rot: -2, d: 0.25, notes: main.notes, alt: `${p.name} — ${z.name.toLowerCase()}` });
    const notes = main.notes.map((n, k) => `<li class="st-in" style="--d: ${(0.8 + k * 0.4).toFixed(2)}s"><i>${k + 1}</i><b>${esc(n.title)}</b> — ${esc(n.text)}</li>`).join('');
    slides.push({ name: z.short, dur: 8, html: `${head(z.name, step, count, 36)}
        <span class="st-blob" style="left: 0; top: 120px; width: 300px; height: 340px"></span>
        ${m.html}
        <ol class="st-notes" style="left: 16px; right: 16px; top: ${m.box.y + m.box.h + 14}px">${notes}</ol>` });

    if (more.length < 2) return;
    const [b1, b2] = more;
    const p1 = polaroid(p, photo(b1.id), { maxW: 188, maxH: 228, x: 14, y: 66, rot: -2.5, d: 0.2, alt: `${p.name} — ${z.name.toLowerCase()}, ещё ракурс` });
    const p2 = polaroid(p, photo(b2.id), { maxW: 188, maxH: 228, right: 14, y: 326, rot: 2.5, d: 0.45, alt: `${p.name} — ${z.name.toLowerCase()}, ещё ракурс` });
    // Each side note points at the photo beside it: that photo's own note if it has one,
    // otherwise the zone's caption (top) or its first spec (bottom)
    const noteHtml = (n) => `<p class="st-red st-hand-sm">${esc(n.title)}</p><p class="st-dark">${esc(n.text)}</p>`;
    const tr = b1.notes[0] ? noteHtml(b1.notes[0]) : `<p class="st-blue st-zone-text">${esc(z.caption)}</p>`;
    const bl = b2.notes[0] ? noteHtml(b2.notes[0])
      : b1.notes[0] ? `<p class="st-blue st-zone-text">${esc(z.caption)}</p>`
      : noteHtml({ title: z.specs[0][0], text: z.specs[0][1] });
    const trX = p1.box.x + p1.box.w + 12, blW = p2.box.x - 34;
    slides.push({ name: `${z.short} — ракурсы`, dur: 7, html: `
        <h2 class="st-title st-in" style="left: 16px; top: 12px; width: 260px; font-size: 30px">${esc(z.name)}</h2>
        <p class="st-step st-in" style="right: 16px; top: 16px; --d: .15s">${esc(count)}</p>
        <span class="st-blob" style="left: 150px; top: 70px; width: 210px; height: 250px"></span>
        <span class="st-blob" style="left: 0; top: 320px; width: 210px; height: 260px"></span>
        ${p1.html}
        ${p2.html}
        <div class="st-in" style="left: ${trX}px; right: 12px; top: 92px; --d: .7s">${tr}</div>
        <div class="st-in" style="left: 16px; width: ${blW}px; top: 372px; --d: .95s">${bl}</div>
        ${arrows([
          arrow(trX + 26, 284, p1.box.x + p1.box.w - 8, 236, { bend: -24, color: 'blue', d: 1.1 }),
          arrow(30, 582, p2.box.x - 8, p2.box.y + p2.box.h - 52, { bend: 26, d: 1.3 }),
        ])}` });
  });

  // 4. Outro: collage and the call to action
  const picks = [s.zones[1], s.zones[4], s.zones[3]].map((z) => photo(shotsOf(z)[0].id));
  const c1 = polaroid(p, picks[0], { maxW: 148, maxH: 170, x: 18, y: 112, rot: -7, d: 0.2, alt: '' });
  const c2 = polaroid(p, picks[1], { maxW: 150, maxH: 175, x: 112, y: 132, rot: 3, d: 0.35, alt: '' });
  const c3 = polaroid(p, picks[2], { maxW: 134, maxH: 160, right: 16, y: 118, rot: 8, d: 0.5, alt: '' });
  slides.push({ name: 'Финал', dur: 10, html: `
        <span class="st-blob" style="left: 10px; top: 14px; width: 340px; height: 100px"></span>
        <h2 class="st-title st-in" style="left: 0; right: 0; top: 18px; text-align: center; font-size: 42px">${esc(s.outro.title)}</h2>
        <p class="st-blue st-in" style="left: 0; right: 0; top: 72px; text-align: center; --d: .1s">${esc(s.outro.text)}</p>
        ${c1.html}
        ${c2.html}
        ${c3.html}
        <span class="st-blob" style="left: 20px; top: 360px; width: 320px; height: 220px"></span>
        <p class="st-blue st-hand-big st-in" style="left: 26px; top: 352px; --rot: -8deg; --d: .7s">${esc(t.hello)}</p>
        <a class="st-cta st-in" href="/price" style="left: 50px; right: 50px; top: 412px; --d: .85s">Хочу так же!</a>
        <a class="st-more st-in" href="#photos" style="left: 0; right: 0; top: 486px; --d: 1s">Все ${p.photos.length} фото проекта — ниже ↓</a>
        <p class="st-red st-hand-mid st-in" style="right: 30px; top: 534px; --rot: -5deg; --d: 1.15s">${esc(t.love)} ♡</p>` });

  return storiesPlayer(p, slides);
}

/* ---------- Stories from ready-made pictures ----------
   For a project whose story Assem already made as Instagram stories: each slide is one
   9:16 picture, shown whole. Phones only, like the drawn stories; desktop goes straight
   from the cover to the photos. */
function phoneStories(p) {
  return `
  <!-- STORY: Instagram-style stories, phones only -->
  <div id="story">
${drawnStories(p) ? storiesSection(p) : imageStories(p)}
  </div>
`;
}

function imageStories(p) {
  const s = p.story;
  const slides = s.slides.map((sl, i) => {
    const file = path.join(ROOT, s.images, `${String(i + 1).padStart(2, '0')}.jpg`);
    if (!fs.existsSync(file)) throw new Error(`${p.slug} stories: ${path.relative(ROOT, file)} not found`);
    const { w, h } = jpegSize(file);
    const src = '/' + path.relative(ROOT, file).slice(0, -4);
    const avif = fs.existsSync(`${file.slice(0, -4)}.avif`);
    const tiny = path.join(path.dirname(file), 'w24', path.basename(file));
    const blur = fs.existsSync(tiny) ? ` style="background: url(data:image/jpeg;base64,${fs.readFileSync(tiny).toString('base64')}) 50% / cover no-repeat"` : '';
    // tappable spots over buttons that are part of the picture
    const links = (sl.links || []).map((l) => `<a class="st-hotspot" href="${esc(l.href)}" aria-label="${esc(l.label)}" style="--x: ${l.x}; --y: ${l.y}; --w: ${l.w}; --h: ${l.h}"></a>`).join('');
    return { name: sl.name, dur: sl.dur || 7, raw: true, cls: 'st-pic-slide', html: `
      <picture>${avif ? `<source srcset="${src}.avif" type="image/avif">` : ''}<img src="${src}.jpg" alt="${esc(sl.alt)}" width="${w}" height="${h}" loading="lazy" decoding="async"${blur}></picture>${links}` };
  });
  return storiesPlayer(p, slides, { bg: s.bg });
}

// The Instagram-style player around a list of slides: progress bars, avatar, reply bar
function storiesPlayer(p, slides, { bg } = {}) {
  const cover = p.cover;
  const bars = slides.map(() => '<i><s></s></i>').join('');
  const body = slides.map((sl, i) => `    <section class="st-slide${sl.cls ? ' ' + sl.cls : ''}${i === 0 ? ' is-active' : ''}" data-name="${esc(sl.name)}" data-dur="${sl.dur}" aria-label="${i + 1} из ${slides.length}: ${esc(sl.name)}">${sl.raw ? sl.html : `
      <div class="st-canvas">${sl.html}
      </div>`}
    </section>`).join('\n');
  const small = (ext) => `/projects/${p.slug}/${cover.thumb ? 'w480/' : ''}${cover.id}.${ext}`;
  const avatar = `${cover.modern && cover.widths.includes(480) ? `<source srcset="${small(cover.modern)}" type="image/${cover.modern}">` : ''}<img src="${small('jpg')}" alt="" width="40" height="40" loading="lazy" decoding="async">`;

  return `
  <section class="stories" aria-label="История проекта ${esc(p.name)}" aria-roledescription="карусель"${bg ? ` style="--st-pic-bg: linear-gradient(${bg.join(', ')})"` : ''}>
    <div class="st-frame">
${body}
      <div class="st-top">
        <div class="st-bars" aria-hidden="true">${bars}</div>
        <div class="st-head">
          <span class="st-avatar"><picture>${avatar}</picture></span>
          <p><b>${esc(p.name)}</b><span>Assem Danakhmet</span></p>
          <button class="st-pause" type="button" aria-label="Пауза"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="st-i-pause" d="M8 5v14M16 5v14"/><path class="st-i-play" d="M8 5l11 7-11 7z"/></svg></button>
        </div>
      </div>
      <div class="st-bottom">
        <a class="st-reply" href="${WHATSAPP}" target="_blank" rel="noopener">Написать Асем…</a>
        <button class="st-like" type="button" aria-label="Нравится" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.3 4c2 0 3.6 1.1 4.7 2.8C13.1 5.1 14.7 4 16.7 4c3.4 0 5.7 3.6 4.5 7.1-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg></button>
        <button class="st-share" type="button" data-share aria-label="Поделиться"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3 10 14.5M21.5 3l-7 18-4.5-6.5L3 10z"/></svg></button>
      </div>
      <button class="st-nav st-prev" type="button">Предыдущий слайд</button>
      <button class="st-nav st-next" type="button">Следующий слайд</button>
    </div>
  </section>`;
}

function projectPage(p, next) {
  const url   = `${SITE}/projects/${p.slug}`;
  const title = `${p.name} — ${p.seo} | Assem Danakhmet`;
  const desc  = `${p.name} — ${p.seo}. ${p.photos.length} фото проекта от дизайнера интерьеров Assem Danakhmet: яркие современные интерьеры с характером.`;
  const label = [p.kind, p.city].filter(Boolean).join(' · ') || 'Дизайн интерьера';
  const zones  = p.story && drawnStories(p);  // drawn phone stories (Caveat)
  const scroll = zones && p.scroll;          // + the desktop scroll story

  const facts = p.facts && p.facts.length
    ? `\n    <dl class="project-facts">\n${p.facts.map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}\n    </dl>`
    : '';
  const intro = p.description || facts
    ? `\n  <div class="project-intro">${p.description ? `\n    <p>${esc(p.description)}</p>` : ''}${facts}\n  </div>\n`
    : '';

  const grid = p.photos
    .map((ph, i) => pic(p.slug, ph, { alt: `${p.name} — ${p.seo}, фото ${i + 1}`, sizes: '(max-width: 900px) 50vw, 33vw' }, '      '))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Generated by scripts/build-projects.mjs — edit the script, not this file -->

  ${TRACKING_HEAD}

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${SITE}/projects/${p.slug}/${p.cover.id}.jpg">
  <meta property="og:image:width" content="${p.cover.w}">
  <meta property="og:image:height" content="${p.cover.h}">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="Assem Danakhmet — Дизайн интерьеров">

  <!-- Favicon -->
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <link rel="preload" as="image"${p.cover.modern ? ` type="image/${p.cover.modern}"` : ''} href="/projects/${p.slug}/${p.cover.id}.${p.cover.modern || 'jpg'}" fetchpriority="high">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant:wght@400&family=Nunito+Sans:wght@400;600${scroll ? '&family=IBM+Plex+Mono:wght@400;500' : ''}${zones ? '&family=Caveat:wght@500;600;700' : ''}&display=swap">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/project.css">${scroll ? '\n  <link rel="stylesheet" href="/project-story.css">' : ''}${p.story ? '\n  <link rel="stylesheet" href="/project-stories.css">' : ''}

  ${POSTHOG}
</head>
<body class="project-page">
  ${GTM_NOSCRIPT}

  <!-- COVER -->
  <header class="project-hero">
${pic(p.slug, p.cover, { alt: `${p.name} — ${p.seo}`, cls: 'project-hero-bg', eager: true }, '    ')}
    <div class="project-hero-text">
      <p class="project-hero-kicker">${esc(label)}</p>
      <h1>${esc(p.name)}</h1>
      <p class="project-hero-sub">Дизайнер интерьеров Assem Danakhmet<span class="sep">|</span><a href="/">assem.design</a></p>
    </div>
    <a class="project-hero-down" href="${p.story ? '#story' : '#photos'}" aria-label="${scroll ? 'К планировке' : p.story ? 'К истории проекта' : 'К фотографиям'}">${icon('down')}</a>
  </header>
${intro}${scroll ? storySection(p) : p.story ? phoneStories(p) : ''}
  <!-- PHOTOS -->
  <section class="project-photos" id="photos" aria-label="Фото проекта">
    <div class="project-bar">
      <nav class="project-tabs" aria-label="Проекты">
        <a class="is-active" href="#photos" aria-current="page">${esc(p.name)}</a>
        <a href="/gallery">Все проекты</a>
      </nav>
      <div class="project-actions">
        <button class="project-icon" type="button" data-share aria-label="Поделиться">${icon('share')}</button>
        <a class="project-icon" href="${WHATSAPP}" target="_blank" rel="noopener" aria-label="Написать в WhatsApp">${icon('chat')}</a>
        <a class="project-cta" href="/price">Хочу так же!</a>
      </div>
    </div>
    <div class="project-grid">
${grid}
    </div>
  </section>

  <!-- NEXT PROJECT -->
  <a class="project-next" href="/projects/${next.slug}">
${pic(next.slug, next.cover, { alt: `${next.name} — ${next.seo}`, cls: 'project-next-bg', sizes: '100vw', cap: true }, '    ')}
    <span class="project-next-kicker">Следующий проект</span>
    <span class="project-next-title">${esc(next.name)}</span>
    <span class="project-next-link">Смотреть проект</span>
  </a>

  <!-- CTA -->
  <footer id="contact" style="padding-bottom: 80px;">
    <div class="footer-grid">
      <div class="footer-text">
        <h2>Давайте обсудим<br>ваш проект</h2>
        <p>Напишите пару слов об объекте: город (Алматы, Астана, Москва или другой), площадь, стадия ремонта и что хотите получить.</p>
        <a class="footer-cta" href="${WHATSAPP}" target="_blank" rel="noopener">Написать</a>
        <div class="socials">
          <a href="${WHATSAPP}" target="_blank" rel="noopener">WhatsApp →</a>
          <a href="https://www.instagram.com/assem_danakhmet?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener">Instagram →</a>
          <a href="https://t.me/assemdesign" target="_blank" rel="noopener">Telegram →</a>
        </div>
      </div>
    </div>
    <div class="huge-logo">ASSEM</div>
  </footer>

  <!-- MOBILE DOCK -->
  <nav class="project-dock" aria-label="Действия">
    <a href="/gallery">${icon('grid')}<span>Проекты</span></a>
    <button type="button" data-share>${icon('share')}<span>Поделиться</span></button>
    <a href="${WHATSAPP}" target="_blank" rel="noopener">${icon('chat')}<span>Написать</span></a>
  </nav>

  <!-- LIGHTBOX -->
  <div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Просмотр фото">
    <button class="lb-close" id="lb-close" aria-label="Закрыть">✕</button>
    <div class="lb-project" id="lb-project"></div>
    <button class="lb-prev"  id="lb-prev"  aria-label="Предыдущее">‹</button>
    <img class="lb-img" id="lb-img" src="" alt="">
    <button class="lb-next"  id="lb-next"  aria-label="Следующее">›</button>
    <div class="lb-counter" id="lb-counter"></div>
  </div>

  <script src="/script.js" defer></script>
  <script src="/project.js" defer></script>${scroll ? '\n  <script src="/project-story.js" defer></script>' : ''}${p.story ? '\n  <script src="/project-stories.js" defer></script>' : ''}
  <script defer src="/_vercel/insights/script.js"></script>
  <script>
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/speed-insights/script.js"></script>

  <!-- Custom events -> PostHog + GA4 + GTM dataLayer -->
  <script>
    (() => {
      const ph = (ev, props) => {
        const p = Object.assign({}, window.__attr && window.__attr.props(), props);
        if (window.posthog) posthog.capture(ev, p);
        if (window.gtag) gtag('event', ev, p);
        (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p));
      };
      const where = (el) =>
        el.closest('.project-bar')  ? 'project_bar' :
        el.closest('.project-dock') ? 'project_dock' :
        el.closest('.project-hero') ? 'project_hero' :
        el.closest('.stories')      ? 'stories' : 'other';
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
          if (btn.hasAttribute('data-share')) ph('project_share', { project: '${p.slug}', placement: where(btn) });
          if (btn.id === 'lb-close')          ph('lightbox_close');
          return;
        }
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.includes('wa.me')) {
          ph('contact_click', { channel: 'whatsapp', placement: a.classList.contains('footer-cta') ? 'footer_cta' : a.closest('.socials') ? 'socials' : where(a) });
        } else if (href.includes('instagram.com')) {
          ph('contact_click', { channel: 'instagram', placement: 'socials' });
        } else if (href.includes('t.me')) {
          ph('contact_click', { channel: 'telegram', placement: 'socials' });
        } else if (href.endsWith('#contact')) {
          ph('scroll_to_contact', { placement: where(a) });
        } else if (href.startsWith('/projects/')) {
          ph('project_open', { project: href.split('/')[2], placement: 'next_project' });
        } else if (href === '/gallery') {
          ph('gallery_open', { project: 'all', placement: where(a) });
        } else if (href === '/') {
          ph('nav_click', { item: 'home', placement: where(a) });
        }
      });
    })();
  </script>
</body>
</html>
`;
}

function galleryCard(p) {
  const meta = [p.city, `${p.photos.length} фото`].filter(Boolean).join(' · ');
  return `      <a class="archive-card" href="/projects/${p.slug}">
${pic(p.slug, p.cover, { alt: `${p.name} — ${p.seo}`, sizes: '(max-width: 900px) 50vw, 25vw', cap: true }, '        ')}
        <div>
          <b>${esc(p.name)}</b>
          <span>${esc(meta)}</span>
        </div>
      </a>`;
}

const projects = [];
for (const p of PROJECTS) {
  const photos = photosOf(p.slug, p.format);
  const coverId = p.cover || '01';
  const cover = photos.find((ph) => ph.id === coverId);
  if (!cover) throw new Error(`${p.slug}: cover ${coverId}.jpg not found`);
  const story = p.story ? (await import(`./stories/${p.slug}.mjs`)).default : null;
  projects.push({ ...p, photos, cover, story });
}

projects.forEach((p, i) => {
  const next = projects[(i + 1) % projects.length];
  fs.writeFileSync(path.join(ROOT, 'projects', `${p.slug}.html`), projectPage(p, next));
  console.log(`projects/${p.slug}.html  ${p.photos.length} photos`);
});

const galleryPath = path.join(ROOT, 'gallery.html');
const gallery = fs.readFileSync(galleryPath, 'utf8');
const START = '<!-- PROJECTS:START -->';
const END   = '<!-- PROJECTS:END -->';
const a = gallery.indexOf(START);
const b = gallery.indexOf(END);
if (a < 0 || b < a) throw new Error(`gallery.html: missing ${START} / ${END}`);
fs.writeFileSync(galleryPath,
  gallery.slice(0, a + START.length) + '\n' + projects.map(galleryCard).join('\n') + '\n      ' + gallery.slice(b));
console.log('gallery.html  cards refreshed');
