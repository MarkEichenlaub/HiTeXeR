// Test bounds field access
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs = require('fs');

const src = `
import graph; import palette; import contour;
size(10cm, 10cm);
real f(real x, real y) { return cos(x)*sin(y); }
pen[] Palette = BWRainbow();
pair a = (0,0); pair b = (2pi, 2pi);
bounds range = image(f, Automatic, a, b, 200, Palette);
label("min=" + (string)range.min, (3,5));
label("max=" + (string)range.max, (3,5.5));
real rmin = range.min;
real rmax = range.max;
label("rmin=" + (string)rmin, (3,3));
label("rmax=" + (string)rmax, (3,3.5));
`;
const r = A.render(src, {format:'svg', containerW:800, containerH:600, labelOutput:'svg-native'});
const svg = typeof r === 'string' ? r : r.svg;
const labelRe = /<text[^>]*>([^<]+)<\/text>/g;
let m;
while ((m = labelRe.exec(svg)) !== null) console.log('label:', m[1]);
