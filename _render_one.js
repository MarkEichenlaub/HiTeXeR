'use strict';
const fs = require('fs');
const path = require('path');
const id = process.argv[2];
if (!id) { console.error('usage: node _render_one.js <id>'); process.exit(1); }
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const asyPath = path.join('comparison', 'asy_src', id + '.asy');
const src = fs.readFileSync(asyPath, 'utf8');
const r = global.window.AsyInterp.render('[asy]\n'+src+'\n[/asy]', {
  containerW: 800, containerH: 600, labelOutput: 'svg-native'
});
fs.writeFileSync('_'+id+'.svg', r.svg);
let sharp;
try { sharp = require('sharp'); } catch(e) {}
const blink = require('./blink-raster.js');
async function convert() {
  if (!sharp) { console.log('wrote _'+id+'.svg (no sharp)'); return; }
  // Rasterize via true Blink (same engine the user sees in blink.html) so the
  // image I look at matches the comparator and the SSIM scorer.
  const png = await blink.rasterizeSVG(r.svg, {});
  await sharp(png).png().toFile('_'+id+'.png');
  const ourMeta0 = await sharp('_'+id+'.png').metadata();
  const W = ourMeta0.width, H = ourMeta0.height;
  const texPath = path.join('comparison', 'texer_pngs', id + '.png');
  if (fs.existsSync(texPath)) {
    const texMeta = await sharp(texPath).metadata();
    const ourMeta = await sharp('_'+id+'.png').metadata();
    const targetH = Math.max(texMeta.height, ourMeta.height);
    const tex = await sharp(texPath).resize({ height: targetH }).png().toBuffer();
    const our = await sharp('_'+id+'.png').resize({ height: targetH }).png().toBuffer();
    const texDims = await sharp(tex).metadata();
    const ourDims = await sharp(our).metadata();
    const sepW = 4;
    const totalW = texDims.width + sepW + ourDims.width;
    // White background: matches what the user and TeXeR see, and keeps gridline
    // gray reading correctly (the old #888 inverted gridline contrast).
    await sharp({ create: { width: totalW, height: targetH, channels: 4, background: '#ffffffff' } })
      .composite([
        { input: tex, left: 0, top: 0 },
        { input: our, left: texDims.width + sepW, top: 0 }
      ]).png().toFile('_cmp_'+id+'.png');
    console.log('wrote _'+id+'.png and _cmp_'+id+'.png  HTX='+W+'x'+H+' TEX='+texMeta.width+'x'+texMeta.height);
  } else {
    console.log('wrote _'+id+'.png  HTX='+W+'x'+H);
  }
  await blink.closeBrowser();
}
convert().catch(e => { console.error(e.stack); process.exit(1); });
