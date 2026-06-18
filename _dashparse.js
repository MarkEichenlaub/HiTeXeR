const fs = require('fs');
const svg = fs.readFileSync('_05548.svg', 'utf8');
const re = /<path d="([^"]*)"[^>]*stroke="(#[0-9a-fA-F]+)"[^>]*stroke-dasharray="([^"]*)"[^>]*>/g;
let m; const rows = [];
while ((m = re.exec(svg)) !== null) {
  const d = m[1], col = m[2];
  // extract numeric coords
  const nums = d.match(/-?\d+\.?\d*/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  rows.push({ col, x: minx.toFixed(0) + '-' + maxx.toFixed(0), y: miny.toFixed(0) + '-' + maxy.toFixed(0), horiz: Math.abs(maxy - miny) < 3 });
}
// group: horizontal dashed lines by column (x range) and color
const horiz = rows.filter(r => r.horiz);
console.log('total dashed paths:', rows.length, 'horizontal:', horiz.length);
// cluster by x-range left edge
for (const r of horiz.sort((a, b) => parseFloat(a.x) - parseFloat(b.x) || parseFloat(a.y) - parseFloat(b.y))) {
  console.log(r.col, 'x=' + r.x, 'y=' + r.y);
}
