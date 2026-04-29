// Test contour() directly with cos(x)*sin(y) and Cvals
const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');

const src = `
import contour;
real f(real x, real y) { return cos(x)*sin(y); }
pair a = (0,0); pair b = (2pi, 2pi);
guide[] cv1 = contour(f, a, b, new real[]{0.5}, 200);
write("cv1.length=", cv1.length);
for (int k = 0; k < cv1.length; ++k) {
  write("path", k, ": length=", length(cv1[k]));
}
`;
const A = global.window.AsyInterp;
const out = [];
const r = A.render(src, {format:'svg', writeOutput: (s) => out.push(s)});
console.log('write outputs:', out);
