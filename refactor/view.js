'use strict';
// What Mark sees in the Blink Comparator, as one image per diagram.
//   node refactor/view.js <id> [<id> ...]   -> refactor/view/<id>.png
// Needs a server for this checkout's index.html: fix-server.js on :7842, or
// set HTX_VIEW_URL (e.g. `python -m http.server 8790` in a worktree, then
// HTX_VIEW_URL=http://127.0.0.1:8790/index.html).
//
// Panels, all at the SAME scale (2 image px per CSS px, i.e. the 240-DPI
// bitmaps before the comparator halves them for display; nothing resized):
//   1. TeXeR PNG exactly as fetched from AoPS (shown at 50% on AoPS and in
//      the comparator).
//   2. HiTeXeR rendered in a real browser page with the same interpreter and
//      KaTeX the editor/comparator load, rasterized on a 2x canvas exactly as
//      the comparator's injectLiveHtx and the editor's TeXeR-faithful raster do.
//   3. Overlay aligned by content center (the comparator's alignContent):
//      TeXeR ink red, HiTeXeR ink blue, shared ink dark.
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'view');
fs.mkdirSync(OUT, { recursive: true });

async function inkBox(buf) {
  const { data, info } = await sharp(buf).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (0.3 * data[i] + 0.6 * data[i + 1] + 0.1 * data[i + 2] < 210) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { data, w: info.width, h: info.height, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, box: [x0, y0, x1, y1] };
}

(async () => {
  const ids = process.argv.slice(2);
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.goto(process.env.HTX_VIEW_URL || 'http://127.0.0.1:7842/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.katexSvg && katexSvg.ready(), { timeout: 60000 });
  for (const id of ids) {
    const src = fs.readFileSync(path.join(ROOT, 'comparison/asy_src', id + '.asy'), 'utf8');
    const dataUrl = await p.evaluate(async (src) => {
      let svg;
      try {
        svg = (window.HTXDocRender && HTXDocRender.isDocument && HTXDocRender.isDocument(src))
          ? HTXDocRender.renderDocSVG(src, AsyInterp, { containerW: 800, containerH: 600, imageCache: {} })
          : AsyInterp.render('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600 }).svg;
      } catch (e) { return 'ERR ' + e.message; }
      const host = document.createElement('div'); host.innerHTML = svg; document.body.appendChild(host);
      const el = host.querySelector('svg');
      const cssW = parseFloat(el.getAttribute('width')) || el.clientWidth, cssH = parseFloat(el.getAttribute('height')) || el.clientHeight;
      const xml = new XMLSerializer().serializeToString(el); host.remove();
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cssW * 2)); c.height = Math.max(1, Math.round(cssH * 2));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }, src);
    if (dataUrl.startsWith('ERR')) { console.log(id, dataUrl); continue; }
    const htx = Buffer.from(dataUrl.split(',')[1], 'base64');
    const texPath = path.join(ROOT, 'comparison/texer_pngs', id + '.png');
    const tex = fs.existsSync(texPath) ? await sharp(texPath).flatten({ background: '#fff' }).png().toBuffer() : null;
    const H = await inkBox(htx);
    const parts = [];
    let T = null;
    if (tex) T = await inkBox(tex);
    // overlay canvas big enough for both, aligned by content center
    let overlay = null;
    if (T) {
      const W = Math.max(T.w, H.w) + 40, HH = Math.max(T.h, H.h) + 40;
      const o = Buffer.alloc(W * HH * 3, 255);
      const put = (S, ox, oy, rgb) => {
        for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
          const i = (y * S.w + x) * 3; const v = 0.3 * S.data[i] + 0.6 * S.data[i + 1] + 0.1 * S.data[i + 2];
          if (v < 200) { const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= W || Y >= HH) continue; const j = (Y * W + X) * 3;
            if (o[j] === 255 && o[j + 1] === 255 && o[j + 2] === 255) { o[j] = rgb[0]; o[j + 1] = rgb[1]; o[j + 2] = rgb[2]; } else { o[j] = 40; o[j + 1] = 40; o[j + 2] = 40; } }
        }
      };
      put(T, Math.round(W / 2 - T.cx), Math.round(HH / 2 - T.cy), [230, 40, 40]);
      put(H, Math.round(W / 2 - H.cx), Math.round(HH / 2 - H.cy), [40, 90, 230]);
      overlay = await sharp(o, { raw: { width: W, height: HH, channels: 3 } }).png().toBuffer();
    }
    const imgs = [tex, htx, overlay].filter(Boolean);
    const metas = await Promise.all(imgs.map(i => sharp(i).metadata()));
    const totW = metas.reduce((s, m) => s + m.width, 0) + 12 * (imgs.length - 1);
    const totH = Math.max(...metas.map(m => m.height));
    let x = 0; const comp = [];
    imgs.forEach((im, k) => { comp.push({ input: im, left: x, top: 0 }); x += metas[k].width + 12; });
    await sharp({ create: { width: totW, height: totH, channels: 3, background: '#d0d0d0' } }).composite(comp).png().toFile(path.join(OUT, id + '.png'));
    const fmtBox = (S) => `${S.w}x${S.h} ink ${S.box[2] - S.box[0] + 1}x${S.box[3] - S.box[1] + 1}`;
    console.log(id, 'TeXeR', T ? fmtBox(T) : '-', '| HiTeXeR', fmtBox(H));
  }
  await b.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
