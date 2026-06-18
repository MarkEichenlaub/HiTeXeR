'use strict';
// Render a list of IDs to _<id>.png (HTX) and _cmp_<id>.png (TeXeR | HTX side-by-side).
// One warm browser for the whole run.
const fs = require('fs');
const path = require('path');
const ids = process.argv.slice(2);
if (!ids.length) { console.error('usage: node _batch_cmp.js <id> [<id> ...]'); process.exit(1); }
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const sharp = require('sharp');
const blink = require('./blink-raster.js');
let epsCache = null;
try { epsCache = require('./eps-cache'); } catch (e) {}

async function one(id) {
  const asyPath = path.join('comparison', 'asy_src', id + '.asy');
  if (!fs.existsSync(asyPath)) { console.log(id + ': NO asy_src'); return; }
  const src = fs.readFileSync(asyPath, 'utf8');
  let imageCache = {};
  if (epsCache) { try { imageCache = epsCache.getImageCache(src); } catch (e) {} }
  let r;
  try {
    r = global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', {
      containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache
    });
  } catch (e) { console.log(id + ': RENDER ERROR ' + (e && e.message)); return; }
  fs.writeFileSync('_' + id + '.svg', r.svg);
  let png;
  try { png = await blink.rasterizeSVG(r.svg, {}); }
  catch (e) { console.log(id + ': RASTER ERROR ' + (e && e.message)); return; }
  await sharp(png).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toFile('_' + id + '.png');
  const ourMeta = await sharp('_' + id + '.png').metadata();
  const W = ourMeta.width, H = ourMeta.height;
  const texPath = path.join('comparison', 'texer_pngs', id + '.png');
  if (fs.existsSync(texPath)) {
    const texMeta = await sharp(texPath).metadata();
    const targetH = Math.max(texMeta.height, H);
    const tex = await sharp(texPath).flatten({ background: { r: 255, g: 255, b: 255 } }).resize({ height: targetH }).png().toBuffer();
    const our = await sharp('_' + id + '.png').resize({ height: targetH }).png().toBuffer();
    const texDims = await sharp(tex).metadata();
    const ourDims = await sharp(our).metadata();
    const sepW = 6;
    const totalW = texDims.width + sepW + ourDims.width;
    await sharp({ create: { width: totalW, height: targetH, channels: 4, background: '#ccccccff' } })
      .composite([{ input: tex, left: 0, top: 0 }, { input: our, left: texDims.width + sepW, top: 0 }])
      .png().toFile('_cmp_' + id + '.png');
    console.log(id + ': HTX=' + W + 'x' + H + '  TEX=' + texMeta.width + 'x' + texMeta.height + '  (left=TEXER, right=HiTeXeR)');
  } else {
    console.log(id + ': HTX=' + W + 'x' + H + '  (no texer ref)');
  }
}

(async () => {
  for (const id of ids) { try { await one(id); } catch (e) { console.log(id + ': ERR ' + (e && e.message)); } }
  await blink.closeBrowser();
})();
