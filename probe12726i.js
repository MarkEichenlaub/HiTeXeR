// What does image() return?
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;

// Patch image() to log range
const fs = require('fs');
const src = `
import graph; import palette; import contour;
size(10cm, 10cm);
pair a = (0,0); pair b = (2pi, 2pi);
real f(real x, real y) { return cos(x)*sin(y); }
pen[] Palette = BWRainbow();
bounds range = image(f, Automatic, a, b, 200, Palette);
real[] Cvals = uniform(range.min, range.max, 10);
`;
// Render and inspect via inserting a marker draw
A.render(src + 'write(range.min);\nwrite(range.max);\n', {format:'svg'});

// Try a different approach: hack to extract range.min / range.max via labels
const src2 = src + `
label((string)range.min, (3,3));
label((string)range.max, (3,4));
for (int i = 0; i < Cvals.length; ++i) label((string)Cvals[i], (5, i*0.3));
draw(contour(f, a, b, Cvals, 200, operator --), black+1bp);
`;
const r = A.render(src2, {format:'svg', containerW:800, containerH:600, labelOutput:'svg-native'});
const svg = typeof r === 'string' ? r : r.svg;
fs.writeFileSync('test_contour_only3.svg', svg);
// Find labels with text content
const labelRe = /<text[^>]*>([^<]+)<\/text>/g;
let m;
const labels = [];
while ((m = labelRe.exec(svg)) !== null) labels.push(m[1]);
console.log('labels:', labels);
