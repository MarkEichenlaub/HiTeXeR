// Compare two render-and-score jsonl outputs (before vs after).
// usage: node _cmp_probe.js _before_probe.jsonl _after_probe.jsonl [sortKey]
const fs = require('fs');
function load(f) {
  const m = new Map();
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (e) { continue; }
    if (o && o.id) m.set(o.id, o);
  }
  return m;
}
const A = load(process.argv[2]), B = load(process.argv[3]);
const rows = [];
for (const [id, a] of A) {
  const b = B.get(id);
  if (!b) { rows.push({ id, note: 'MISSING-AFTER' }); continue; }
  const f = x => x == null ? NaN : +x;
  rows.push({
    id,
    cb: f(a.combined), ca: f(b.combined),
    dC: f(b.combined) - f(a.combined),
    wb: f(a.wRatio), wa: f(b.wRatio),
    hb: f(a.hRatio), ha: f(b.hRatio),
  });
}
rows.sort((x, y) => (x.dC || 0) - (y.dC || 0));
const fmt = n => isNaN(n) ? '  -  ' : n.toFixed(3).padStart(6);
let worse = 0, better = 0, same = 0;
console.log('id     dComb   comb b→a        wR b→a          hR b→a');
for (const r of rows) {
  if (r.note) { console.log(r.id, r.note); continue; }
  if (r.dC < -0.02) worse++; else if (r.dC > 0.02) better++; else same++;
  const sizeErrB = Math.max(Math.abs(r.wb - 1), Math.abs(r.hb - 1));
  const sizeErrA = Math.max(Math.abs(r.wa - 1), Math.abs(r.ha - 1));
  const flag = r.dC < -0.02 ? ' <<< WORSE' : (sizeErrA < sizeErrB - 0.02 ? ' (size better)' : (sizeErrA > sizeErrB + 0.02 ? ' (size WORSE)' : ''));
  console.log(`${r.id} ${fmt(r.dC)}  ${fmt(r.cb)}→${fmt(r.ca)}  ${fmt(r.wb)}→${fmt(r.wa)}  ${fmt(r.hb)}→${fmt(r.ha)}${flag}`);
}
console.log(`\nbetter(>+0.02): ${better}  worse(<-0.02): ${worse}  same: ${same}`);
