/*
 * Renders a project's drawn phone stories into fixed 1080×1920 pictures
 * (projects/<slug>/stories/NN.jpg + NN.avif), the way Éclat's stories are pictures.
 *
 *   DRAWN_STORIES=1 node scripts/build-projects.mjs     # page with the drawn stories
 *   python3 -m http.server 8000                         # in the repo root, in another tab
 *   node scripts/render-stories.mjs amore               # writes the pictures
 *   python3 scripts/make-variants.py && node scripts/build-projects.mjs   # back to pictures
 *
 * Needs Google Chrome (macOS path below) and Python with Pillow (for JPEG/AVIF).
 * Prints each slide's text, to update the alt texts in scripts/stories/<slug>.mjs.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const slug = process.argv[2];
const base = process.argv[3] || 'http://localhost:8000';
if (!slug) { console.error('usage: node scripts/render-stories.mjs <slug> [base-url]'); process.exit(1); }

// The canvas is 360×600; a 360×640 picture leaves 40px of paper on top, which the player
// lets slip under its progress bars
const PAD_TOP = 40;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-'));
const port = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}/profile`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); } }
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

  await send('Page.enable');
  await send('Runtime.enable');
  // reduced motion: no entrance animations, no autoplay
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // 360 wide and 600 + top bar + reply bar high, so the canvas renders at scale 1
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 3, mobile: true });
  await send('Page.navigate', { url: `${base}/projects/${slug}.html` });
  await sleep(3000);
  const drawn = await run(`!!document.querySelector('.stories .st-canvas')`);
  if (!drawn) throw new Error('no drawn stories on the page — build it with DRAWN_STORIES=1 first');
  await run(`(async () => {
    const st = document.querySelector('.stories');
    st.scrollIntoView({ block: 'start' });
    const imgs = [...st.querySelectorAll('img')];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    await document.fonts.ready;
    const css = document.createElement('style');
    css.textContent = '.st-top,.st-bottom,.st-nav{visibility:hidden!important}.st-slide.is-waiting::after{display:none!important}';
    document.head.append(css);
    await new Promise((r) => setTimeout(r, 800));
  })()`);

  const outDir = path.join(ROOT, 'projects', slug, 'stories');
  fs.mkdirSync(outDir, { recursive: true });
  const n = await run(`document.querySelectorAll('.st-slide').length`);
  for (let k = 0; k < n; k++) {
    const s = await run(`(async () => {
      const slides = [...document.querySelectorAll('.st-slide')];
      slides.forEach((x, j) => x.classList.toggle('is-active', j === ${k}));
      await new Promise((r) => setTimeout(r, 350));
      const c = slides[${k}].querySelector('.st-canvas'), r = c.getBoundingClientRect();
      const text = [...c.querySelectorAll('h2,p,li,figcaption,td,th,text,span')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean);
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, name: slides[${k}].dataset.name, text: [...new Set(text)].join(' · ') };
    })()`);
    if (Math.round(s.w) !== 360) throw new Error(`slide ${k + 1}: canvas is ${s.w}px wide, expected 360`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: s.x, y: s.y - PAD_TOP, width: 360, height: 640, scale: 1 } });
    const png = path.join(tmp, `${String(k + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    console.log(`${k + 1}. ${s.name} — ${s.text}`);
  }
  ws.close();

  // JPEG (fallback) and AVIF next to each other, as for Éclat
  execFileSync('python3', ['-c', `
import glob, os, sys
from PIL import Image
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.png'))):
    n = os.path.basename(f)[:-4]
    im = Image.open(f).convert('RGB')
    im.save(os.path.join(sys.argv[2], n + '.jpg'), quality=82, optimize=True, progressive=True)
    im.save(os.path.join(sys.argv[2], n + '.avif'), quality=55)
`, tmp, outDir], { stdio: 'inherit' });
  console.log(`${n} pictures in ${path.relative(ROOT, outDir)}/`);
} finally {
  chrome.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
