'use strict';
const fs = require('fs');
const orig = fs.readFileSync('./asy-interp.js', 'utf8');
const patched = orig.replace(
  /pxPerUnit = Math\.min\(targetW \/ scaleRefW, targetH \/ scaleRefH\);/,
  `pxPerUnit = Math.min(targetW / scaleRefW, targetH / scaleRefH);
    process.stderr.write('[DBGsize] keepAspect=' + keepAspect + ' sizeW=' + sizeW + ' sizeH=' + sizeH +
      ' scaleRefW=' + scaleRefW + ' scaleRefH=' + scaleRefH +
      ' geoMinX=' + geoMinX + ' geoMaxX=' + geoMaxX + ' geoMinY=' + geoMinY + ' geoMaxY=' + geoMaxY + '\\n');`
);
fs.writeFileSync('./_asy_interp_patched.js', patched);
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
require('./_asy_interp_patched.js');
const src = fs.readFileSync('comparison/asy_src/03892.asy', 'utf8');
const svg = window.AsyInterp.render(src, { format: 'svg' });
