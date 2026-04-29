// Test what range.min/range.max from image() produces
const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');

const src = `
import graph;
import palette;
import contour;
size(10cm, 10cm);
pair a = (0,0); pair b = (2pi, 2pi);
real f(real x, real y) { return cos(x)*sin(y); }
int N = 200;
pen[] Palette = BWRainbow();
bounds range = image(f, Automatic, a, b, N, Palette);
real[] Cvals = uniform(range.min, range.max, 10);
draw(contour(f, a, b, Cvals, N, operator --), black+1bp);
`;
const A = global.window.AsyInterp;
const r = A.render(src, {format:'svg', containerW: 800, containerH: 600, labelOutput:'svg-native'});
const svg = typeof r === 'string' ? r : r.svg;
fs.writeFileSync('test_contour_only2.svg', svg);

// inspect contour paths
const re = /<path d="([^"]+)" fill="none" stroke="#000000"/g;
let m, count = 0;
const sizes = [];
while ((m = re.exec(svg)) !== null) {
  count++;
  const d = m[1];
  sizes.push(d.length);
  // check for diagonals
  const nums = d.match(/[\d.\-]+/g).map(Number);
  let xs = [], ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i+1]); }
  let consecDiag = 0, maxConsec = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - xs[i-1]) > 0.01 && Math.abs(ys[i] - ys[i-1]) > 0.01) {
      consecDiag++;
      if (consecDiag > maxConsec) maxConsec = consecDiag;
    } else consecDiag = 0;
  }
  if (count <= 3) console.log('path ' + count + ': len=' + d.length + ' maxConsecDiag=' + maxConsec + ' first=' + d.substring(0, 100));
}
console.log('total black paths:', count);
console.log('size dist:', sizes.sort((a,b)=>a-b).slice(0, 5), '...', sizes.slice(-5));
