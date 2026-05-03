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
async function convert() {
  if (!sharp) { console.log('wrote _'+id+'.svg (no sharp)'); return; }
  const wm = r.svg.match(/data-intrinsic-w="([^"]+)"/);
  const hm = r.svg.match(/data-intrinsic-h="([^"]+)"/);
  const W = wm ? Math.round(parseFloat(wm[1])) : 800;
  const H = hm ? Math.round(parseFloat(hm[1])) : 600;
  await sharp(Buffer.from(r.svg), { density: 96 })
    .resize(W, H, { fit: 'inside' }).png().toFile('_'+id+'.png');
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
    await sharp({ create: { width: totalW, height: targetH, channels: 4, background: '#888888ff' } })
      .composite([
        { input: tex, left: 0, top: 0 },
        { input: our, left: texDims.width + sepW, top: 0 }
      ]).png().toFile('_cmp_'+id+'.png');
    console.log('wrote _'+id+'.png and _cmp_'+id+'.png  HTX='+W+'x'+H+' TEX='+texMeta.width+'x'+texMeta.height);
  } else {
    console.log('wrote _'+id+'.png  HTX='+W+'x'+H);
  }
}
convert();
