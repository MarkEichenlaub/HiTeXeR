'use strict';
// Display-scale comparator: composes TeXeR vs HiTeXeR AT THE SCALE A STUDENT
// SEES THEM — both as 240-DPI rasters downsampled 2:1 (the browser's display
// transform for TeXeR PNGs on AoPS, and for HiTeXeR's TeXeR-faithful preview).
// This is the ONLY view that should be used for perceptual verdicts; the raw
// 240-DPI grid is for geometry measurements.
//
// usage: node _display_cmp.js <id> [zoom]
const fs = require('fs');
const path = require('path');
const id = process.argv[2];
const zoom = parseInt(process.argv[3] || '1', 10);
if (!id) { console.error('usage: node _display_cmp.js <id> [zoom]'); process.exit(1); }
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const htxDoc = require('./htx-doc-render.js');
const src = fs.readFileSync(path.join('comparison', 'asy_src', id + '.asy'), 'utf8');
const r = htxDoc.isDocument(src)
  ? { svg: htxDoc.renderDocSVG(src, global.window.AsyInterp, { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} }) }
  : global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
const sharp = require('sharp');
const blink = require('./blink-raster.js');

async function displayScale(buf) {
  // 240-DPI raster -> displayed size (half), bilinear-ish like the browser.
  const m = await sharp(buf).metadata();
  return sharp(buf)
    .flatten({ background: '#ffffff' })
    .resize({ width: Math.max(1, Math.round(m.width / 2)), kernel: 'mitchell' })
    .png().toBuffer();
}

(async () => {
  const htx240 = await blink.rasterizeSVG(r.svg, {});
  const texPath = path.join('comparison', 'texer_pngs', id + '.png');
  if (!fs.existsSync(texPath)) { console.error('no texer ref'); process.exit(1); }
  let tex = await displayScale(fs.readFileSync(texPath));
  let htx = await displayScale(htx240);
  if (zoom > 1) {
    const zm = async (b) => { const m = await sharp(b).metadata(); return sharp(b).resize({ width: m.width * zoom, kernel: 'nearest' }).png().toBuffer(); };
    tex = await zm(tex); htx = await zm(htx);
  }
  const tm = await sharp(tex).metadata(), hm = await sharp(htx).metadata();
  const H = Math.max(tm.height, hm.height);
  const sep = 6;
  await sharp({ create: { width: tm.width + sep + hm.width, height: H, channels: 4, background: '#dddddd' } })
    .composite([
      { input: tex, left: 0, top: 0 },
      { input: htx, left: tm.width + sep, top: 0 },
    ]).png().toFile('_disp_' + id + '.png');
  console.log('wrote _disp_' + id + '.png  (LEFT=TeXeR-as-displayed, RIGHT=HiTeXeR-as-displayed' + (zoom > 1 ? ', zoom x' + zoom : '') + ')');
  await blink.closeBrowser();
})().catch(e => { console.error(e.stack); process.exit(1); });
