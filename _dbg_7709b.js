global.window = {};
global.katex = require('katex');
const fs = require('fs');
const orig = fs.readFileSync('./asy-interp.js', 'utf8');
const patched = orig.replace(
  "if (dc.cmd === 'label' || dc.cmd === 'dot') {",
  "if (dc.cmd === 'label' || dc.cmd === 'dot') { if(dc.cmd==='label') console.log('LABEL pen:', JSON.stringify(dc.pen), 'pos:', JSON.stringify(dc.pos), 'text:', dc.text);"
);
fs.writeFileSync('_asy_patched2.js', patched);
require('./_asy_patched2.js');
const A = window.AsyInterp;
const raw = fs.readFileSync('comparison/asy_src/07709.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';
A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
