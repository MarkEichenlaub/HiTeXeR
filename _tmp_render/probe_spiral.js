global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;

// Hack: read asy-interp source to call internals manually
const fs = require('fs');
const src = fs.readFileSync('../comparison/asy_src/12830.asy', 'utf8');

const full = A.render('[asy]\n' + src + '\n[/asy]', {containerW:400,containerH:400,labelOutput:'svg-native'});
console.log('svg length:', full.svg.length);
const fills = full.svg.match(/fill="#[0-9A-Fa-f]{6}"/g) || [];
const uniq = [...new Set(fills)];
console.log('unique fills:', uniq.length, 'samples:', uniq.slice(0, 15));
console.log('path count:', (full.svg.match(/<path/g) || []).length);

// Also test just the graph() directly
const test = '[asy]\nimport graph3;\nreal x(real t) { return 3*cos(t); }\nreal y(real t) { return 3*sin(t); }\nreal z(real t) { return t; }\npath3 p = graph(x, y, z, 0, 6*pi, 10, operator ..);\nwrite("path p length: ", length(p));\n[/asy]';
try {
  const r = A.render(test, {containerW:200,containerH:200,labelOutput:'svg-native'});
  console.log('Test SVG length:', r.svg.length);
} catch(e) {
  console.log('Test error:', e.message);
}
