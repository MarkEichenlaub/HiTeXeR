'use strict';
// Batch-render a list of corpus IDs into side-by-side TeXeR|HiTeXeR comparison
// PNGs, reusing one warm Blink browser. Usage: node _axbatch.js 00115 00133 ...
const fs = require('fs');
const path = require('path');
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const sharp = require('sharp');
const blink = require('./blink-raster.js');

const ids = process.argv.slice(2);
async function main() {
  for (const id of ids) {
    const asyPath = path.join('comparison', 'asy_src', id + '.asy');
    if (!fs.existsSync(asyPath)) { console.log(id, 'NO SRC'); continue; }
    const src = fs.readFileSync(asyPath, 'utf8');
    let r;
    try {
      r = global.window.AsyInterp.render('[asy]\n'+src+'\n[/asy]', {
        containerW: 800, containerH: 600, labelOutput: 'svg-native'
      });
    } catch (e) { console.log(id, 'RENDER ERR', e.message); continue; }
    fs.writeFileSync('_'+id+'.svg', r.svg);
    let png;
    try { png = await blink.rasterizeSVG(r.svg, {}); }
    catch (e) { console.log(id, 'RASTER ERR', e.message); continue; }
    await sharp(png).png().toFile('_'+id+'.png');
    const ourMeta0 = await sharp('_'+id+'.png').metadata();
    const W = ourMeta0.width, H = ourMeta0.height;
    const texPath = path.join('comparison', 'texer_pngs', id + '.png');
    if (fs.existsSync(texPath)) {
      const texMeta = await sharp(texPath).metadata();
      const targetH = Math.max(texMeta.height, H);
      const tex = await sharp(texPath).resize({ height: targetH }).png().toBuffer();
      const our = await sharp('_'+id+'.png').resize({ height: targetH }).png().toBuffer();
      const texDims = await sharp(tex).metadata();
      const ourDims = await sharp(our).metadata();
      const sepW = 4;
      const totalW = texDims.width + sepW + ourDims.width;
      await sharp({ create: { width: totalW, height: targetH, channels: 4, background: '#ffffffff' } })
        .composite([
          { input: tex, left: 0, top: 0 },
          { input: our, left: texDims.width + sepW, top: 0 }
        ]).png().toFile('_cmp_'+id+'.png');
      console.log(id, 'OK  HTX='+W+'x'+H+' TEX='+texMeta.width+'x'+texMeta.height);
    } else {
      console.log(id, 'OK (no tex ref)  HTX='+W+'x'+H);
    }
  }
  await blink.closeBrowser();
}
main().catch(e => { console.error(e.stack); process.exit(1); });
