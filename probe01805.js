global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const sharp = require('sharp');
(async () => {
  const raw = fs.readFileSync('comparison/asy_src/01805.asy', 'utf8');
  const r = A.render(raw, { containerW: 800, containerH: 600, labelOutput: 'svg-native', format: 'svg' });
  const svg = typeof r === 'string' ? r : r.svg;
  fs.writeFileSync('test01805.svg', svg);
  const png = await sharp(Buffer.from(svg), { density: 288 }).png().toBuffer();
  fs.writeFileSync('test01805.png', png);
  console.log('rendered. svg=', svg.length, 'bytes png=', png.length, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });
