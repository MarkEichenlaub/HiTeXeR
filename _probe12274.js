global.window = {};
const fs = require('fs');
const asy = fs.readFileSync('comparison/asy_src/12274.asy', 'utf8');
require('./asy-interp.js');
const out = window.AsyInterp.render(asy);
console.log('pxPerUnit:', out.pxPerUnit);
console.log('minX:', out.minX, 'maxX:', out.maxX, 'w:', out.maxX - out.minX);
console.log('minY:', out.minY, 'maxY:', out.maxY, 'h:', out.maxY - out.minY);
// Extract viewBox from SVG
const m = out.svg.match(/viewBox="([^"]+)"/);
console.log('viewBox:', m && m[1]);
const wm = out.svg.match(/<svg[^>]*width="([^"]+)"/);
const hm = out.svg.match(/<svg[^>]*height="([^"]+)"/);
console.log('svg width:', wm && wm[1], 'height:', hm && hm[1]);
