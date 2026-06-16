'use strict';
// Render a list of IDs with the CURRENT code and compute SSIM vs the texer ref.
// Reuses one warm Blink browser. Usage: node _ssimbatch.js out.json id1 id2 ...
const fs = require('fs');
const path = require('path');
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const sharp = require('sharp');
const blink = require('./blink-raster.js');
const { ssim } = require('ssim.js');

const outFile = process.argv[2];
const ids = process.argv.slice(3);

async function toGray(buf, W, H) {
  return await sharp(buf).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer();
}
async function main() {
  const res = {};
  for (const id of ids) {
    const asyPath = path.join('comparison', 'asy_src', id + '.asy');
    const texPath = path.join('comparison', 'texer_pngs', id + '.png');
    if (!fs.existsSync(asyPath) || !fs.existsSync(texPath)) { res[id] = null; continue; }
    try {
      const src = fs.readFileSync(asyPath, 'utf8');
      const r = global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', {
        containerW: 800, containerH: 600, labelOutput: 'svg-native'
      });
      const png = await blink.rasterizeSVG(r.svg, {});
      const texMeta = await sharp(texPath).metadata();
      const W = texMeta.width, H = texMeta.height;
      const ourG = await toGray(png, W, H);
      const texG = await sharp(texPath).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer();
      const a = { data: new Uint8Array(ourG), width: W, height: H };
      const b = { data: new Uint8Array(texG), width: W, height: H };
      const { mssim } = ssim(a, b);
      res[id] = mssim;
    } catch (e) { res[id] = 'ERR:' + e.message.slice(0, 60); }
  }
  await blink.closeBrowser();
  fs.writeFileSync(outFile, JSON.stringify(res, null, 0));
  console.log('wrote', outFile);
}
main().catch(e => { console.error(e.stack); process.exit(1); });
