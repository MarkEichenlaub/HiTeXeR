'use strict';
// Label fidelity probe: compare label ink metrics (width/height/center, in bp)
// between (1) local Asymptote oracle (real LaTeX/CM via dvisvgm), (2) HTX
// pipeline path (labelOutput:'svg-native', MathJax glyphs), and (3) HTX
// browser path (KaTeX foreignObject / SVG text, as seen in index.html).
// All three are rasterized with the same headless-Chromium engine.
//
// Each specimen draws two registration dots at (+-60,0) (filled circles,
// r=1.5bp) plus the label under test, with unitsize(1bp). Ink between the
// dots is measured relative to the dot centers => content metrics in bp.
//
// usage: node _lblprobe.js [--only id1,id2] [--save]   (PNGs to _lblprobe_out/)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = __dirname;
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
const TMP = 'C:\\Users\\Public\\htx_label_probe';
const OUT = path.join(ROOT, '_lblprobe_out');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const blink = require('./blink-raster.js');
global.window = global.window || {};
require('./asy-interp.js');
const A = global.window.AsyInterp;

const SPECIMENS = [
  { id: 'm_neg5',    body: 'label("$-5$",(0,0));' },
  { id: 't_neg5',    body: 'label("-5",(0,0));' },
  { id: 'm_x',       body: 'label("$x$",(0,0));' },
  { id: 't_x',       body: 'label("x",(0,0));' },
  { id: 'm_y',       body: 'label("$y$",(0,0));' },
  { id: 'm_abc',     body: 'label("$abc$",(0,0));' },
  { id: 't_abc',     body: 'label("abc",(0,0));' },
  { id: 'm_AB',      body: 'label("$AB$",(0,0));' },
  { id: 'm_fx',      body: 'label("$f(x)=2x-3$",(0,0));' },
  { id: 'm_3m1',     body: 'label("$3-1$",(0,0));' },
  { id: 'm_x1',      body: 'label("$x_1$",(0,0));' },
  { id: 'm_xsq',     body: 'label("$x^2$",(0,0));' },
  { id: 'm_frac12',  body: 'label("$\\frac{1}{2}$",(0,0));' },
  { id: 'm_sqrt2',   body: 'label("$\\sqrt{2}$",(0,0));' },
  { id: 'm_sintheta',body: 'label("$\\sin\\theta$",(0,0));' },
  { id: 'm_pi',      body: 'label("$\\pi$",(0,0));' },
  { id: 'mix_W1',    body: 'label("$W-1$ cells",(0,0));' },
  { id: 't_mass',    body: 'label("Mass (kg)",(0,0));' },
  { id: 'm_coord',   body: 'label("$(3,-4)$",(0,0));' },
  { id: 'm_100',     body: 'label("$100$",(0,0));' },
  { id: 'm_mrm',     body: 'label("$\\mathrm{m}$",(0,0));' },
  { id: 'm_mbf',     body: 'label("$\\mathbf{v}$",(0,0));' },
  { id: 'm_ell',     body: 'label("$\\ell$",(0,0));' },
  { id: 'm_45deg',   body: 'label("$45^\\circ$",(0,0));' },
  // alignment specimens: small dot at origin, label aligned by direction
  { id: 'al_N',      body: 'dot((0,0),linewidth(2));label("$M$",(0,0),N);', alignDot: true },
  { id: 'al_S',      body: 'dot((0,0),linewidth(2));label("$M$",(0,0),S);', alignDot: true },
  { id: 'al_E',      body: 'dot((0,0),linewidth(2));label("$M$",(0,0),E);', alignDot: true },
  { id: 'al_W',      body: 'dot((0,0),linewidth(2));label("$M$",(0,0),W);', alignDot: true },
  { id: 'al_NE',     body: 'dot((0,0),linewidth(2));label("$M$",(0,0),NE);', alignDot: true },
  { id: 'al_NW',     body: 'dot((0,0),linewidth(2));label("$M$",(0,0),NW);', alignDot: true },
  { id: 'al_SE',     body: 'dot((0,0),linewidth(2));label("$M$",(0,0),SE);', alignDot: true },
  { id: 'al_SW',     body: 'dot((0,0),linewidth(2));label("$M$",(0,0),SW);', alignDot: true },
  { id: 'al_2NE',    body: 'dot((0,0),linewidth(2));label("$M$",(0,0),2NE);', alignDot: true },
  { id: 'al_dir75',  body: 'dot((0,0),linewidth(2));label("$K$",(0,0),dir(75));', alignDot: true },
  { id: 'al_dir30',  body: 'dot((0,0),linewidth(2));label("$K$",(0,0),dir(30));', alignDot: true },
  { id: 'al_dir255', body: 'dot((0,0),linewidth(2));label("$D$",(0,0),dir(255));', alignDot: true },
  { id: 'al_dotlbl', body: 'dot("$K$",(0,0),dir(75));', alignDot: true },
  { id: 'al_dotlw2', body: 'dot("$K$",(0,0),dir(75),linewidth(2));', alignDot: true },
  { id: 'al_dotlw5', body: 'dot("$K$",(0,0),dir(75),linewidth(5));', alignDot: true },
  { id: 'al_E_text', body: 'dot((0,0),linewidth(2));label("Mass (kg)",(0,0),E);', alignDot: true },
  { id: 'al_W_text', body: 'dot((0,0),linewidth(2));label("Mass (kg)",(0,0),W);', alignDot: true },
];

function srcFor(sp) {
  return 'unitsize(1bp);\nfill(circle((-60,0),1.5));\nfill(circle((60,0),1.5));\n' +
    sp.body + '\n';
}

// ---- ink measurement -------------------------------------------------------
// Returns {pxPerBp, originX, originY, label:{x0,x1,y0,y1,cx,cy,w,h}} in bp,
// or null when measurement fails.
async function measurePng(buf, opts) {
  opts = opts || {};
  const img = sharp(buf).flatten({ background: '#ffffff' }).greyscale();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const TH = 160;
  // column/row ink presence
  let xmin = Infinity, xmax = -Infinity;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (data[row + x] < TH) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
    }
  }
  if (!(xmax > xmin)) return null;
  // estimate scale assuming total span ~ 123bp (dots at +-60, r 1.5)
  let pxPerBp = (xmax - xmin) / 123;
  // dot centroids within 6bp of each end
  const dotRegion = (cx0, cx1) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(W - 1, Math.ceil(cx1)); x++) {
        if (data[row + x] < TH) { sx += x; sy += y; n++; }
      }
    }
    return n ? { x: sx / n, y: sy / n, n } : null;
  };
  const d1 = dotRegion(xmin, xmin + 6 * pxPerBp);
  const d2 = dotRegion(xmax - 6 * pxPerBp, xmax);
  if (!d1 || !d2 || d2.x - d1.x < 10) return null;
  pxPerBp = (d2.x - d1.x) / 120;
  const originX = (d1.x + d2.x) / 2;
  const originY = (d1.y + d2.y) / 2;
  // label ink: x in (d1.x + 8bp, d2.x - 8bp), excluding the small align dot
  // at origin when present (alignDot: exclude ink within 2.5bp of origin).
  const x0lim = d1.x + 8 * pxPerBp, x1lim = d2.x - 8 * pxPerBp;
  const excl = opts.alignDot ? 2.6 * pxPerBp : -1;
  let lx0 = Infinity, lx1 = -Infinity, ly0 = Infinity, ly1 = -Infinity, cnt = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = Math.floor(x0lim); x <= Math.ceil(x1lim); x++) {
      if (x < 0 || x >= W) continue;
      if (data[row + x] < TH) {
        if (excl > 0 && Math.hypot(x - originX, y - originY) < excl) continue;
        if (x < lx0) lx0 = x; if (x > lx1) lx1 = x;
        if (y < ly0) ly0 = y; if (y > ly1) ly1 = y;
        cnt++;
      }
    }
  }
  if (!(lx1 >= lx0) || cnt < 4) return null;
  const toBpX = (px) => (px - originX) / pxPerBp;
  const toBpY = (px) => (originY - px) / pxPerBp; // y up
  return {
    pxPerBp,
    label: {
      x0: toBpX(lx0), x1: toBpX(lx1 + 1),
      y0: toBpY(ly1 + 1), y1: toBpY(ly0),
      w: (lx1 + 1 - lx0) / pxPerBp,
      h: (ly1 + 1 - ly0) / pxPerBp,
      cx: (toBpX(lx0) + toBpX(lx1 + 1)) / 2,
      cy: (toBpY(ly1 + 1) + toBpY(ly0)) / 2,
    },
  };
}

// ---- oracle ----------------------------------------------------------------
function oracleSvg(sp) {
  const asyFile = path.join(TMP, sp.id + '.asy');
  const svgFile = path.join(TMP, sp.id + '.svg');
  fs.writeFileSync(asyFile, srcFor(sp));
  try { fs.unlinkSync(svgFile); } catch (e) {}
  try {
    execFileSync(ASY, ['-f', 'svg', '-noV', '-o', sp.id, asyFile],
      { timeout: 60000, cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return null;
  }
  try { return fs.readFileSync(svgFile, 'utf8'); } catch (e) { return null; }
}

// ---- HTX pipeline path ------------------------------------------------------
function htxPipeSvg(sp) {
  try {
    const r = A.render('[asy]\n' + srcFor(sp) + '\n[/asy]',
      { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
    return r && r.svg || null;
  } catch (e) { return null; }
}

// ---- HTX browser path (KaTeX in a real page) --------------------------------
let _browserPage = null;
async function getBrowserPage() {
  if (_browserPage) return _browserPage;
  const browser = await blink.getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
  const katexDir = path.join(ROOT, 'node_modules', 'katex', 'dist');
  let css = fs.readFileSync(path.join(katexDir, 'katex.min.css'), 'utf8');
  // Rewrite font urls to base64 data URIs (headless chromium blocks file:// fonts)
  css = css.replace(/src:url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)[^;}]*/g, (m, name) => {
    const p = path.join(katexDir, 'fonts', name + '.woff2');
    if (!fs.existsSync(p)) return m;
    const b64 = fs.readFileSync(p).toString('base64');
    return `src:url("data:font/woff2;base64,${b64}") format("woff2")`;
  });
  const katexJs = fs.readFileSync(path.join(katexDir, 'katex.min.js'), 'utf8');
  const interpJs = fs.readFileSync(path.join(ROOT, 'asy-interp.js'), 'utf8');
  const katexSvgJs = fs.readFileSync(path.join(ROOT, 'katex-svg.js'), 'utf8');
  const glyphJson = fs.readFileSync(path.join(ROOT, 'katex-glyphs.json'), 'utf8');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css +
    '*{margin:0;padding:0}html,body{background:#fff}#stage{display:inline-block;background:#fff}#stage svg{display:block}' +
    '</style></head><body><div id="stage"></div></body></html>';
  await page.setContent(html, { waitUntil: 'load' });
  await page.addScriptTag({ content: katexJs });
  await page.addScriptTag({ content: katexSvgJs });
  await page.addScriptTag({ content: 'window.katexSvg.init(' + glyphJson + ');' });
  await page.addScriptTag({ content: interpJs });
  // Force the KaTeX faces to load so canvas measureText sees real metrics.
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('12px KaTeX_Main'),
      document.fonts.load('bold 12px KaTeX_Main'),
      document.fonts.load('italic 12px KaTeX_Main'),
      document.fonts.load('italic 12px KaTeX_Math'),
    ]);
    await document.fonts.ready;
  });
  _browserPage = page;
  return page;
}

async function htxBrowserPng(sp) {
  const page = await getBrowserPage();
  const src = srcFor(sp);
  const ok = await page.evaluate((code) => {
    try {
      const r = window.AsyInterp.render('[asy]\n' + code + '\n[/asy]',
        { containerW: 800, containerH: 600, imageCache: {} });
      if (!r || !r.svg) return 'no-svg';
      document.getElementById('stage').innerHTML = r.svg;
      return 'ok';
    } catch (e) { return 'err:' + (e && e.message); }
  }, src);
  if (ok !== 'ok') { console.error(`  [browser] ${sp.id}: ${ok}`); return null; }
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}
  const el = await page.$('#stage svg') || await page.$('#stage');
  if (!el) return null;
  return el.screenshot({ type: 'png', omitBackground: false });
}

// ---- main -------------------------------------------------------------------
(async () => {
  const args = process.argv.slice(2);
  let only = null;
  const save = args.includes('--save');
  const oi = args.indexOf('--only');
  if (oi !== -1) only = new Set(args[oi + 1].split(','));

  const rows = [];
  for (const sp of SPECIMENS) {
    if (only && !only.has(sp.id)) continue;
    const row = { id: sp.id };
    // oracle
    const osvg = oracleSvg(sp);
    if (osvg) {
      const png = await blink.rasterizeSVG(osvg, { scale: 2 });
      if (save) fs.writeFileSync(path.join(OUT, sp.id + '_oracle.png'), png);
      row.oracle = (await measurePng(png, sp)) || undefined;
    }
    // pipeline
    const psvg = htxPipeSvg(sp);
    if (psvg) {
      const png = await blink.rasterizeSVG(psvg, { scale: 2 });
      if (save) fs.writeFileSync(path.join(OUT, sp.id + '_pipe.png'), png);
      row.pipe = (await measurePng(png, sp)) || undefined;
    }
    // browser
    const bpng = await htxBrowserPng(sp);
    if (bpng) {
      if (save) fs.writeFileSync(path.join(OUT, sp.id + '_brow.png'), bpng);
      row.brow = (await measurePng(bpng, sp)) || undefined;
    }
    rows.push(row);
    const f = (m) => m && m.label
      ? `w=${m.label.w.toFixed(1)} h=${m.label.h.toFixed(1)} c=(${m.label.cx.toFixed(1)},${m.label.cy.toFixed(1)})`
      : 'FAIL';
    console.log(`${sp.id.padEnd(11)} oracle[${f(row.oracle)}]  pipe[${f(row.pipe)}]  brow[${f(row.brow)}]`);
  }

  // summary deltas
  console.log('\n--- deltas vs oracle (bp): dW=width err, dCx/dCy=center offset ---');
  for (const r of rows) {
    if (!r.oracle || !r.oracle.label) continue;
    const o = r.oracle.label;
    const d = (m) => m && m.label
      ? `dW=${(m.label.w - o.w).toFixed(1)} dCx=${(m.label.cx - o.cx).toFixed(1)} dCy=${(m.label.cy - o.cy).toFixed(1)}`
      : 'FAIL';
    console.log(`${r.id.padEnd(11)} pipe[${d(r.pipe)}]  brow[${d(r.brow)}]`);
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(rows, null, 1));
  await blink.closeBrowser();
})().catch(e => { console.error(e); process.exit(1); });
