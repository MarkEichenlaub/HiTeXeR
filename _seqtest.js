global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
// Test sequence(a,b) and the currentpicture shift duplication.
function run(code) {
  try { const r = A.render('[asy]\n' + code + '\n[/asy]', { containerW: 400, containerH: 400, labelOutput: 'svg-native' }); return r.svg; } catch (e) { return 'ERR ' + e.message; }
}
// 1) sequence test: draw a dot for each i, count
const t1 = `int[] s1 = sequence(1,3); int[] s2 = sequence(5,9);
write("seq(1,3)="); write(s1); write("seq(5,9)="); write(s2);`;
// asy-interp doesn't print write() to console reliably; instead test via dots count.
// draw dots at (i,0) for sequence(5,9):
const svgA = run('size(100);\nfor(int i : sequence(5,9)){ dot((i,0)); }');
const nA = (svgA.match(/<circle/g) || []).length;
console.log('sequence(5,9) dot count =', nA, '(expect 5)');
const svgB = run('size(100);\nfor(int i : sequence(1,3)){ dot((i,0)); }');
const nB = (svgB.match(/<circle/g) || []).length;
console.log('sequence(1,3) dot count =', nB, '(expect 3)');
// print actual i values via x positions
const xs = [...svgA.matchAll(/cx="([\-0-9.]+)"/g)].map(m => +m[1]).sort((a,b)=>a-b);
console.log('sequence(5,9) circle cx (sorted):', xs.map(x=>x.toFixed(0)));
