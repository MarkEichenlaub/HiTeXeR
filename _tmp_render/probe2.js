global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;

// Simulate what 12845 does
const code = `[asy]
import three;
size(10cm);
path3[] p = reverse(unitcircle3) ^^ scale3(0.5)*unitcircle3;
// Inspect p: how many paths? For each, how many segs?
write("p type: ", p);
write("p.length: ", p.length);
[/asy]`;

try {
  const r = A.render(code, {containerW:400,containerH:400,labelOutput:'svg-native'});
  console.log('SVG length:', r.svg.length);
  console.log('writes:', r.writes);
} catch (e) {
  console.log('Error:', e.message);
}

// Now do the full render and inspect via hooks
const fs = require('fs');
const src = fs.readFileSync('../comparison/asy_src/12845.asy', 'utf8');

// Instrument: monkey-patch isPath to log calls
const origIsPath = A._debug || null;

console.log('\n--- Full render ---');
const full = A.render('[asy]\n' + src + '\n[/asy]', {containerW:400,containerH:400,labelOutput:'svg-native'});
console.log('SVG length:', full.svg.length);
// Count distinct fill colors
const fills = full.svg.match(/fill="#[0-9A-Fa-f]{6}"/g) || [];
const uniq = [...new Set(fills)];
console.log('unique fills:', uniq);
console.log('path count:', (full.svg.match(/<path/g) || []).length);
