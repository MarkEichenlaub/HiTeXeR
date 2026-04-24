global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;

const code = `[asy]
import three;
size(10cm);
path3[] p = reverse(unitcircle3) ^^ scale3(0.5)*unitcircle3;
write("p type inspection");
write(p);
write("-----");
// Try: what is p.length via array access?
// In Asymptote, path3[] should have .length
write("Now checking individual paths");
path3 p0 = p[0];
write(p0);
[/asy]`;

try {
  const r = A.render(code, {containerW:400,containerH:400,labelOutput:'svg-native'});
  console.log('writes field:', r.writes);
  console.log('svg length:', r.svg.length);
  console.log('svg sample:', r.svg.substring(0, 500));
} catch (e) {
  console.log('Error:', e.message);
  console.log('Stack:', e.stack);
}
