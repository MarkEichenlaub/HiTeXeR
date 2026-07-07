'use strict';
// Oracle-only: derive real TeX label BOX widths from E/W-aligned ink positions.
// box = (inkLeft_E - margin) + inkW + (|inkRight_W| - margin)  [bp]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const blink = require('./blink-raster.js');
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');

const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
const TMP = 'C:\\Users\\Public\\htx_label_probe';
fs.mkdirSync(TMP, { recursive: true });
const FS12 = 11.9551681195517;
const MARGIN = 0.28 * FS12 + 0.25; // labelmargin(currentpen) = 3.5974

const STRINGS = {
  M: '$M$', x: '$x$', AB: '$AB$', xy: '$xy$', Mx: '$Mx$',
  f: '$f$', P: '$P$', T: '$T$', d: '$d$', V: '$V$',
  num2: '$2$', xsq: '$x^2$', paren: '$(a,b)$', text: 'Mass (kg)',
  A: '$A$', B: '$B$', C: '$C$', W: '$W$', ffx: '$f(x)$',
};

function srcFor(str, align) {
  return 'unitsize(1bp);\nfill(circle((-60,0),1.5));\nfill(circle((60,0),1.5));\n' +
    'label("' + str + '",(0,0),' + align + ');\n';
}
async function measure(png) {
  const { data, info } = await sharp(png).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W = info.width, H = info.height, TH = 160;
  let xmin = 1e9, xmax = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[y*W+x] < TH) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
  let pxPerBp = (xmax - xmin) / 123;
  const dotC = (a, b) => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < H; y++) for (let x = Math.max(0, Math.floor(a)); x <= Math.min(W-1, Math.ceil(b)); x++) if (data[y*W+x] < TH) { sx += x; sy += y; n++; } return n ? { x: sx/n, y: sy/n } : null; };
  const d1 = dotC(xmin, xmin + 6*pxPerBp), d2 = dotC(xmax - 6*pxPerBp, xmax);
  if (!d1 || !d2) return null;
  pxPerBp = (d2.x - d1.x) / 120;
  const ox = (d1.x + d2.x) / 2;
  const x0lim = d1.x + 8*pxPerBp, x1lim = d2.x - 8*pxPerBp;
  let lx0 = 1e9, lx1 = -1;
  for (let y = 0; y < H; y++) for (let x = Math.floor(x0lim); x <= Math.ceil(x1lim); x++) if (x >= 0 && x < W && data[y*W+x] < TH) { if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; }
  if (lx1 < lx0) return null;
  return { x0: (lx0 - ox)/pxPerBp, x1: (lx1 + 1 - ox)/pxPerBp, w: (lx1 + 1 - lx0)/pxPerBp };
}
async function oracle(str, align, id) {
  const asyF = path.join(TMP, id + '.asy'), svgF = path.join(TMP, id + '.svg');
  fs.writeFileSync(asyF, srcFor(str, align));
  try { fs.unlinkSync(svgF); } catch (e) {}
  try { execFileSync(ASY, ['-f','svg','-noV','-o',id,asyF], { timeout: 60000, cwd: TMP, stdio: ['ignore','pipe','pipe'] }); } catch (e) { return null; }
  let svg; try { svg = fs.readFileSync(svgF, 'utf8'); } catch (e) { return null; }
  const png = await blink.rasterizeSVG(svg, { scale: 2 });
  return measure(png);
}
(async () => {
  const ks = global.window.katexSvg || global.katexSvg;
  console.log('string | TeXbox(bp) | lsb | rsb | katexW(bp) | D(TeX-katex)');
  for (const [id, str] of Object.entries(STRINGS)) {
    const e = await oracle(str, 'E', 'bx_' + id + '_E');
    const w = await oracle(str, 'W', 'bx_' + id + '_W');
    if (!e || !w) { console.log(id, 'FAIL'); continue; }
    const lsb = e.x0 - MARGIN;
    const rsb = -w.x1 - MARGIN;
    const box = lsb + e.w + rsb;
    let kw = null;
    try {
      const inner = /^\$.*\$$/.test(str) ? str.slice(1, -1) : str;
      const m = ks.measure(inner);
      kw = m && m.widthEm * FS12;
    } catch (err) {}
    console.log(id.padEnd(6), box.toFixed(2).padStart(7), lsb.toFixed(2).padStart(6), rsb.toFixed(2).padStart(6), (kw != null ? kw.toFixed(2) : '--').padStart(8), (kw != null ? (box - kw).toFixed(2) : '--').padStart(7));
  }
  await blink.closeBrowser();
})().catch(e => { console.error(e); process.exit(1); });
