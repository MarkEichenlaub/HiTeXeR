'use strict';
// node refactor/diff-runs.js A.json B.json  — lists ids whose SVG hash or error changed, and timing deltas.
const fs = require('fs');
const [a, b] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const changed = [], errNew = [], errFixed = [];
let ta = 0, tb = 0;
for (const id of Object.keys(a)) {
  if (!b[id]) continue;
  ta += a[id].ms || 0; tb += b[id].ms || 0;
  if (a[id].h !== b[id].h) changed.push(id);
  if (!a[id].err && b[id].err) errNew.push(id + ': ' + b[id].err);
  if (a[id].err && !b[id].err) errFixed.push(id);
}
console.log(`changed SVGs: ${changed.length}`); if (changed.length) console.log('  ' + changed.slice(0, 60).join(','));
console.log(`new errors: ${errNew.length}`); errNew.slice(0, 30).forEach(e => console.log('  ' + e));
console.log(`fixed errors: ${errFixed.length}`);
console.log(`render time: ${(ta/1000).toFixed(1)}s -> ${(tb/1000).toFixed(1)}s`);
