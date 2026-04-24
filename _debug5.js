global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs');
let src = fs.readFileSync('asy-interp.js','utf8');
src = src.replace(
  "env.set('extrude', (...args) => {",
  "env.set('extrude', (...args) => { console.error('EXTRUDE called');"
);
fs.writeFileSync('_asy_interp_patched.js', src);
require('./_asy_interp_patched.js');
const A = window.AsyInterp;
// Direct call without for loop
const code = '[asy]\nimport three;\npath pp = unitcircle;\ndraw(extrude(pp, -0.4Z));\n[/asy]';
const r = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
