// auto-fix/ratio-probe.js  (throwaway dev tool)
// For each id: render via AsyInterp -> intrinsic w/h; predicted htx_png = intrinsic*2
// (validated exact); read texer_pngs dims; print wRatio/hRatio = htx/texer.
// Use to measure size-fix impact in-process (no rasterizing).
//   node auto-fix/ratio-probe.js <id,id,...>
//   node auto-fix/ratio-probe.js @basket.txt        (one id per line, # comments ok)
'use strict';
global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;
const sharp = require('sharp');

function loadIds(arg) {
  if (arg && arg.startsWith('@')) {
    return fs.readFileSync(arg.slice(1), 'utf8').split('\n')
      .map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  }
  return (arg || '').split(',').map(s => s.trim()).filter(Boolean);
}

(async () => {
  const ids = loadIds(process.argv[2]);
  console.log('id\twR\thR\tgeoMean\tnote');
  for (const id of ids) {
    let asy;
    try { asy = fs.readFileSync(path.join(ROOT, 'comparison', 'asy_src', id + '.asy'), 'utf8'); }
    catch { console.log(id + '\t(no asy)'); continue; }
    let iw, ih;
    try {
      const r = A.render('[asy]\n' + asy + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
      iw = parseFloat((r.svg.match(/data-intrinsic-w="([^"]+)"/) || [])[1]);
      ih = parseFloat((r.svg.match(/data-intrinsic-h="([^"]+)"/) || [])[1]);
    } catch (e) { console.log(id + '\tERR\t' + String(e && e.message || e).slice(0, 60)); continue; }
    let tw, th;
    try { const m = await sharp(path.join(ROOT, 'comparison', 'texer_pngs', id + '.png')).metadata(); tw = m.width; th = m.height; }
    catch { console.log(id + '\t(no texer)\t' + (iw * 2).toFixed(0) + 'x' + (ih * 2).toFixed(0)); continue; }
    const wR = (iw * 2) / tw, hR = (ih * 2) / th;
    const g = Math.sqrt(Math.max(wR, 1e-6) * Math.max(hR, 1e-6));
    let note = '';
    if (g > 1.15) note = 'BIG';
    else if (g < 0.85) note = 'small';
    else note = 'ok';
    console.log(`${id}\t${wR.toFixed(3)}\t${hR.toFixed(3)}\t${g.toFixed(3)}\t${note}`);
  }
})();
