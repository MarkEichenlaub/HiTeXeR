// auto-fix/intrinsic-probe.js  (throwaway dev tool)
// In-process: render each id via AsyInterp, print intrinsic w/h (CSS px).
// Size ratios are rasterizer-independent, so intrinsic dims track the htx_png
// size up to the (scale-invariant) trim. Compare intrinsic deltas across a
// code change to predict wRatio/hRatio movement without rasterizing.
'use strict';
global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;

const ids = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean);
for (const id of ids) {
  let asy;
  try { asy = fs.readFileSync(path.join(ROOT, 'comparison', 'asy_src', id + '.asy'), 'utf8'); }
  catch { console.log(id + '  (no asy)'); continue; }
  try {
    const r = A.render('[asy]\n' + asy + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
    const iw = r.svg.match(/data-intrinsic-w="([^"]+)"/);
    const ih = r.svg.match(/data-intrinsic-h="([^"]+)"/);
    console.log(id + '\t' + (iw ? parseFloat(iw[1]).toFixed(2) : '?') + '\t' + (ih ? parseFloat(ih[1]).toFixed(2) : '?'));
  } catch (e) {
    console.log(id + '\tERR\t' + String(e && e.message || e).slice(0, 80));
  }
}
