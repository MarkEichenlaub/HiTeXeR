const fs = require('fs');
const lines = fs.readFileSync('_canary_out.json', 'utf8').split('\n');
const results = [];
for (const line of lines) {
  if (!line.trim() || line.includes('"summary"')) continue;
  try {
    const r = JSON.parse(line);
    if (r.id && Math.abs(r.delta) > 0.005) results.push({id: r.id, pre: r.pre, ssim: r.ssim, delta: r.delta});
  } catch(e) {}
}
results.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
console.log(JSON.stringify(results, null, 2));
