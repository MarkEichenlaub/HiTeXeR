global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const sharp = require('sharp');
(async () => {
  const files = ['07710', '07696', '07709'];
  for (const f of files) {
    const raw = fs.readFileSync('comparison/asy_src/'+f+'.asy', 'utf8');
    const code = '[asy]\n' + raw + '\n[/asy]';
    const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
    fs.writeFileSync('_'+f+'.svg', r.svg);
    const buf = await sharp(Buffer.from(r.svg), { density: 144 }).png().toBuffer();
    fs.writeFileSync('_'+f+'_htx.png', buf);
    const tx = fs.readFileSync('comparison/texer_pngs/'+f+'.png');
    fs.writeFileSync('_'+f+'_texer.png', tx);
    const iw = r.svg.match(/data-intrinsic-w="([^"]+)"/);
    const ih = r.svg.match(/data-intrinsic-h="([^"]+)"/);
    const texer = await sharp('comparison/texer_pngs/'+f+'.png').metadata();
    const htxPxW = parseFloat(iw[1]) * 2;
    const htxPxH = parseFloat(ih[1]) * 2;
    console.log(f, 'HTX=', htxPxW.toFixed(0)+'x'+htxPxH.toFixed(0),
      '  TeXeR=', texer.width+'x'+texer.height,
      '  ratioW=', (htxPxW/texer.width*100).toFixed(1)+'%');
  }
})();
