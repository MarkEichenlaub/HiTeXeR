global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs');
let src = fs.readFileSync('asy-interp.js','utf8');
// Log ALL draw calls
src = src.replace(
  "env.set('extrude', (...args) => {",
  "env.set('extrude', (...args) => { console.error('EXTRUDE called');"
);
// Log top-level eval errors
fs.writeFileSync('_asy_interp_patched.js', src);
require('./_asy_interp_patched.js');
const A = window.AsyInterp;
// Tiny test
const code = '[asy]\nimport three;\npath[] g=reverse(unitcircle)^^scale(0.5)*unitcircle;\nfor(path pp : g) draw(extrude(pp, -0.4Z));\n[/asy]';
const r = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
console.error('errors:', r && r.errors);
