// Compare fresh ssim-results.json against the v9.47 snapshot for the affected
// ids; report the biggest movers in both directions.
// usage: node _ab_diff.js [threshold]
const fs = require('fs');
const thr = parseFloat(process.argv[2] || '0.01');
const base = JSON.parse(fs.readFileSync('_ssim_baseline_v947.json', 'utf8'));
const cur = JSON.parse(fs.readFileSync('comparison/ssim-results.json', 'utf8'));
const ids = new Set(fs.readFileSync('_affected_ids.txt', 'utf8').split(','));
const bm = new Map(), cm = new Map();
for (const e of (base.results || base)) bm.set(e.id, e);
for (const e of (cur.results || cur)) cm.set(e.id, e);
const rows = [];
for (const id of ids) {
  const b = bm.get(id), c = cm.get(id);
  if (!b || !c) continue;
  const d = (c.combined || 0) - (b.combined || 0);
  if (Math.abs(d) >= thr) rows.push({ id, d, b: b.combined || 0, c: c.combined || 0, bs: b.ssim, cs: c.ssim, bz: b.sizeScore, cz: c.sizeScore });
}
rows.sort((a, b) => a.d - b.d);
const fmt = r => `${r.id} ${r.d >= 0 ? '+' : ''}${r.d.toFixed(4)} (comb ${r.b.toFixed(3)}->${r.c.toFixed(3)} ssim ${(r.bs || 0).toFixed(3)}->${(r.cs || 0).toFixed(3)} size ${(r.bz || 0).toFixed(3)}->${(r.cz || 0).toFixed(3)})`;
const reg = rows.filter(r => r.d < 0), win = rows.filter(r => r.d > 0);
console.log(`== ${reg.length} regressions <= -${thr}, ${win.length} wins >= +${thr} (of ${ids.size} affected) ==`);
console.log('-- worst regressions --');
for (const r of reg.slice(0, 40)) console.log(fmt(r));
console.log('-- best wins --');
for (const r of win.slice(-25).reverse()) console.log(fmt(r));
let sum = 0, n = 0;
for (const id of ids) { const b = bm.get(id), c = cm.get(id); if (b && c) { sum += (c.combined || 0) - (b.combined || 0); n++; } }
console.log(`net combined delta over ${n} scored: ${sum >= 0 ? '+' : ''}${sum.toFixed(3)} (mean ${(sum / n).toFixed(5)})`);
