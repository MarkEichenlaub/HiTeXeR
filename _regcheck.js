const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const regs = [];
rl.on('line', l => {
  try {
    const r = JSON.parse(l);
    if (r.delta != null && r.delta < -0.005) regs.push(r);
  } catch(e) {}
});
rl.on('close', () => {
  regs.sort((a,b) => a.delta - b.delta);
  for (const r of regs) {
    console.log(r.id, 'delta=', r.delta.toFixed(4), 'pre=', r.pre.toFixed(3), 'post=', r.ssim.toFixed(3), 'combined=', r.combined.toFixed(4), 'source=', r.baselineSource);
  }
});
