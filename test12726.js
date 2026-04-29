global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/12726.asy', 'utf8');
const r = A.render('[asy]\n' + raw + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
fs.writeFileSync('test12726.svg', r.svg);
console.log('canInterpret:', A.canInterpret('[asy]\n' + raw + '\n[/asy]'));
