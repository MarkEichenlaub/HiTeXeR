global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/07710.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';
const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
// Show SVG dimensions attributes
const iw = r.svg.match(/data-intrinsic-w="([^"]+)"/);
const ih = r.svg.match(/data-intrinsic-h="([^"]+)"/);
const vb = r.svg.match(/viewBox="([^"]+)"/);
console.log('intrinsic-w:', iw && iw[1]);
console.log('intrinsic-h:', ih && ih[1]);
console.log('viewBox:', vb && vb[1]);
// Count <path> elements and extract stroke widths
const strokes = r.svg.match(/stroke-width="[^"]+"/g) || [];
console.log('strokes:', strokes.slice(0, 10));
// Extract first few path d attributes
const paths = r.svg.match(/<path[^>]*d="[^"]{0,80}/g) || [];
console.log('paths:', paths.slice(0, 5));
console.log('warnings:', r.warnings);
