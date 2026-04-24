global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs');
let src = fs.readFileSync('asy-interp.js','utf8');
// Log extrude calls
src = src.replace(
  "env.set('extrude', (...args) => {",
  "env.set('extrude', (...args) => { console.error('extrude called with args:', args.map(a => { if (!a) return 'null'; if (a._tag) return a._tag; if (Array.isArray(a)) return 'array('+a.length+')'; return typeof a; }));"
);
fs.writeFileSync('_asy_interp_patched.js', src);
require('./_asy_interp_patched.js');
const A = window.AsyInterp;
const raw = fs.readFileSync('comparison/asy_src/12845.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';
A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
