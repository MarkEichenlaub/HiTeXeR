const fs = require('fs');
const svg = fs.readFileSync('test12726.svg', 'utf8');
// Find black-stroked path commands and analyze them
const re = /<path d="([^"]+)" fill="none" stroke="#000000"[^>]*\/>/g;
let m;
const paths = [];
while ((m = re.exec(svg)) !== null) {
  const d = m[1];
  // Count points (move/line/curve commands)
  const cmds = d.match(/[MLC]/g) || [];
  // Get bbox approx
  const nums = d.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  let xs = [], ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i+1]); }
  const bbox = {
    xmin: Math.min(...xs), xmax: Math.max(...xs),
    ymin: Math.min(...ys), ymax: Math.max(...ys),
  };
  paths.push({cmdCount: cmds.length, bbox});
}
console.log('total black paths:', paths.length);
// Bucket by cmd count
const long = paths.filter(p => p.cmdCount > 20);
console.log('long paths (>20 cmds):', long.length);
for (const p of long.slice(0, 5)) console.log(' ', p);
const xrange = paths.filter(p => p.bbox.xmax - p.bbox.xmin > 100 && p.cmdCount < 5);
console.log('horizontal-spanning short paths:', xrange.length);
for (const p of xrange.slice(0, 3)) console.log(' ', p);
