global.window = global.window || {};
global.katex = require('katex');
require('../asy-interp.js');
const A = window.AsyInterp;

const test = `[asy]
import solids;
size(200);
currentprojection=orthographic(5,4,2);
pen skeletonpen=blue+0.15mm;
revolution upcone=cone(-Z,1,1);
draw(surface(upcone),green);
draw(upcone,5,skeletonpen,longitudinalpen=nullpen);
[/asy]`;

const r = A.render(test, {containerW:400,containerH:400,labelOutput:'svg-native'});
// Show all blue stroke opacities
const paths = r.svg.match(/<path[^/]*stroke="#0000ff"[^/]*\/>/g) || [];
console.log('blue stroke paths:', paths.length);
for (const p of paths.slice(0, 5)) {
  const op = p.match(/opacity="([^"]+)"/);
  const w = p.match(/stroke-width="([^"]+)"/);
  console.log(' opacity:', op ? op[1] : 'none', ' width:', w ? w[1] : 'none');
}

// check without longitudinalpen=nullpen
const test2 = `[asy]
import solids;
size(200);
currentprojection=orthographic(5,4,2);
pen skeletonpen=blue+0.15mm;
revolution upcone=cone(-Z,1,1);
draw(surface(upcone),green);
draw(upcone,5,skeletonpen);
[/asy]`;
const r2 = A.render(test2, {containerW:400,containerH:400,labelOutput:'svg-native'});
const paths2 = r2.svg.match(/<path[^/]*stroke="#0000ff"[^/]*\/>/g) || [];
console.log('\nwithout nullpen — blue stroke paths:', paths2.length);
for (const p of paths2.slice(0, 5)) {
  const op = p.match(/opacity="([^"]+)"/);
  console.log(' opacity:', op ? op[1] : 'none');
}
