const fs = require('fs');
function load(f) {
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)
    .map(s => { try { return JSON.parse(s); } catch (e) { return null; } })
    .filter(r => r && r.id && r.combined != null);
}
const base = load('_samp107.jsonl');
const baseMap = new Map(base.map(r => [r.id, r.combined]));
function report(name, f) {
  const cur = load(f);
  let imp = 0, reg = 0, flat = 0, sum = 0, worst = [], bigReg = [];
  for (const r of cur) {
    if (!baseMap.has(r.id)) continue;
    const d = r.combined - baseMap.get(r.id);
    sum += d;
    if (d > 0.003) imp++; else if (d < -0.003) reg++; else flat++;
    worst.push([r.id, +d.toFixed(4)]);
    if (d < -0.01) bigReg.push([r.id, +d.toFixed(4)]);
  }
  worst.sort((a, b) => a[1] - b[1]);
  console.log('\n=== ' + name + ' vs 1.07 (n=' + cur.length + ') ===');
  console.log('improved(>+.003):', imp, ' regressed(<-.003):', reg, ' flat:', flat);
  console.log('mean combined delta:', (sum / cur.length).toFixed(5));
  console.log('worst10:', JSON.stringify(worst.slice(0, 10)));
  console.log('best5:', JSON.stringify(worst.slice(-5).reverse()));
  console.log('regressions > 0.01:', bigReg.length, JSON.stringify(bigReg.slice(0, 12)));
  console.log('regressions > 0.03 (canary-fail level):', worst.filter(w => w[1] < -0.03).length);
}
report('cal=1.03', '_samp103.jsonl');
report('cal=1.00', '_samp100.jsonl');
