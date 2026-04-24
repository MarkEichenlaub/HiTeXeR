global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;
// Hook into path inspection: print the segment gaps for the path
const fs = require('fs');
const src = fs.readFileSync('../comparison/asy_src/12845.asy', 'utf8');
const code = '[asy]\n' + src + '\n[/asy]';
const r = A.render(code, {containerW:400,containerH:400,labelOutput:'svg-native'});
// Count distinct path commands in svg
const svg = r.svg;
const matches = svg.match(/<path/g) || [];
console.log('path count in svg:', matches.length);
console.log('svg length:', svg.length);
console.log('sample beginning:');
console.log(svg.substring(0, 1500));
