global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/12845.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';

// Monkey-patch to trace - first let's grab the internals
// Actually just check the output SVG and see whether first path in fill is the caps
const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
const svg = result && (result.svg || (result.body && result.body.outerHTML) || '');
// Print first three fill paths
const matches = svg.match(/<path [^>]*fill="([^"]*)"/g);
if (matches) {
  for (let i = 0; i < Math.min(6, matches.length); i++) console.log(matches[i]);
  console.log('total paths:', matches.length);
}
