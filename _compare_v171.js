// Compare v1.71 (two-gate heuristic) vs v1.70 (threshold=50).
'use strict';
const fs = require('fs');
const base = JSON.parse(fs.readFileSync('comparison/ssim-results.backup-v1.70.json','utf8'));
const n = JSON.parse(fs.readFileSync('comparison/ssim-results.json','utf8'));
const bm = {}; for (const r of base) bm[r.id] = r;
const nm = {}; for (const r of n) nm[r.id] = r;

let improved=0, worse=0, same=0, seriousImp=0, seriousReg=0;
let totalBase=0, totalNew=0, count=0;
const regressions=[], improvements=[];
for (const id in nm) {
  if (!bm[id]) continue;
  const b = bm[id].ssim, a = nm[id].ssim;
  if (b == null || a == null) continue;
  count++;
  totalBase += b; totalNew += a;
  const d = a - b;
  if (d > 0.01) improved++;
  else if (d < -0.01) worse++;
  else same++;
  if (d > 0.05) seriousImp++;
  if (d < -0.05) {
    seriousReg++;
    regressions.push({ id, b, a, d, sz: nm[id].sizeScore });
  }
  if (d > 0.10) improvements.push({ id, b, a, d });
}

console.log('Total:', count);
console.log('Improved (>+0.01):', improved);
console.log('Same (+/-0.01):', same);
console.log('Regressed (>-0.01):', worse);
console.log('Serious improvements (>+0.05):', seriousImp);
console.log('Serious regressions (>-0.05):', seriousReg);
console.log('Mean SSIM base:', (totalBase/count).toFixed(4), 'new:', (totalNew/count).toFixed(4), 'delta:', ((totalNew-totalBase)/count).toFixed(4));

regressions.sort((x,y) => x.d - y.d);
console.log('\nTop 20 regressions:');
for (const r of regressions.slice(0,20)) {
  console.log(r.id, 'base=', r.b.toFixed(3), 'new=', r.a.toFixed(3), 'delta=', r.d.toFixed(3), 'sz=', r.sz?.toFixed(2));
}

improvements.sort((x,y) => y.d - x.d);
console.log('\nTop 20 improvements:');
for (const r of improvements.slice(0,20)) {
  console.log(r.id, 'base=', r.b.toFixed(3), 'new=', r.a.toFixed(3), 'delta=+', r.d.toFixed(3));
}
