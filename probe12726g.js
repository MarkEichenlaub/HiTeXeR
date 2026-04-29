// Render only the contour() output, skip everything else
const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');

const src = `
import contour;
real f(real x, real y) { return cos(x)*sin(y); }
pair a = (0,0); pair b = (2pi, 2pi);
size(400, 400);
draw(contour(f, a, b, new real[]{0.5}, 200), black+1bp);
`;
const A = global.window.AsyInterp;
const r = A.render(src, {format:'svg', containerW: 400, containerH: 400, labelOutput:'svg-native'});
const svg = typeof r === 'string' ? r : r.svg;
fs.writeFileSync('test_contour_only.svg', svg);

// inspect
const re = /<path d="([^"]+)" fill="none" stroke="#000000"/g;
let m, count = 0;
while ((m = re.exec(svg)) !== null) {
  count++;
  const d = m[1];
  console.log('path ' + count + ' (' + d.length + ' chars):', d.substring(0, 200));
}
console.log('total paths:', count);
