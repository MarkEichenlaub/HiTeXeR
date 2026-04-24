'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IDS = ['12791', '12792', '12817', '12830', '12845'];
const DIR = __dirname;

(async () => {
  for (const id of IDS) {
    const svgPath = path.join(DIR, id + '.svg');
    const pngPath = path.join(DIR, id + '_htx.png');
    if (!fs.existsSync(svgPath)) { console.log('missing', svgPath); continue; }
    try {
      const buf = fs.readFileSync(svgPath);
      await sharp(buf, { density: 144 })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png()
        .toFile(pngPath);
      const stat = fs.statSync(pngPath);
      console.log(id, 'OK', stat.size, 'bytes');
    } catch (e) {
      console.log(id, 'FAIL', e.message);
    }
  }
})();
