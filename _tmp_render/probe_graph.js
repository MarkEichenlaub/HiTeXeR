global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;

const code = `[asy]
import graph3;
real r(real t) {return 3exp(-0.1*t);}
real x(real t) {return r(t)*cos(t);}
real y(real t) {return r(t)*sin(t);}
real z(real t) {return t;}
path3 p=graph(x,y,z,0,6*pi,10,operator ..);
write("len=", length(p));
// Print each segment p0
for (int i = 0; i <= 10; ++i) {
  triple pt = point(p, i);
  write(pt);
}
[/asy]`;

try {
  const r = A.render(code, {containerW:400,containerH:400,labelOutput:'svg-native'});
  console.log('svg len:', r.svg.length);
  // Dump writes via logs
} catch(e) {
  console.log('Err:', e.message);
}

// Direct probe: evaluate the path and inspect
const code2 = `[asy]
import graph3;
real xf(real t) {return 3*exp(-0.1*t)*cos(t);}
real yf(real t) {return 3*exp(-0.1*t)*sin(t);}
real zf(real t) {return t;}
path3 pp = graph(xf, yf, zf, 0, 6*pi, 10, operator ..);
dot(pp);
[/asy]`;
const r2 = A.render(code2, {containerW:400,containerH:400,labelOutput:'svg-native'});
console.log('dot render svg len:', r2.svg.length);
console.log('sample:', r2.svg.substring(0, 1000));
