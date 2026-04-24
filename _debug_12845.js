const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');

// Test with simpler code to isolate
const simpleCode = `
import three;
size(10cm);
path[] g = reverse(unitcircle) ^^ scale(0.5)*unitcircle;
write(g.length);
for(path pp : g) {
  write("iteration");
}
`;

require('./asy-interp.js');
const A = window.AsyInterp;
const code = '[asy]\n' + simpleCode + '\n[/asy]';
const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
console.log('Warnings:', result.warnings);
console.log('SVG length:', result.svg.length);
