global.window = {};
const fs = require('fs');
require('./asy-interp.js');
const ids = ['12274', '07727', '00129', '00130', '00131', '03418', '08521', '12275', '12288'];
for (const id of ids) {
  try {
    const asy = fs.readFileSync(`comparison/asy_src/${id}.asy`, 'utf8');
    const out = window.AsyInterp.render(asy);
    const w = out.maxX - out.minX;
    const h = out.maxY - out.minY;
    const ar = w / h;
    console.log(id, 'pxPU:', out.pxPerUnit.toFixed(2), 'wxh:', w.toFixed(2), 'x', h.toFixed(2), 'ar:', ar.toFixed(2));
  } catch (e) { console.log(id, 'err:', e.message); }
}
