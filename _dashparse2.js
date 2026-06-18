const fs = require('fs');
const svg = fs.readFileSync('_05548.svg', 'utf8');
const re = /<path d="([^"]*)"[^>]*stroke="(#[0-9a-fA-F]+)"[^>]*stroke-dasharray="([^"]*)"[^>]*\/>/g;
let m;
while ((m = re.exec(svg)) !== null) {
  const d = m[1], col = m[2];
  const nums = d.match(/-?\d+\.?\d*/g).map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const miny = Math.min(...ys), maxy = Math.max(...ys);
  if (col === '#c0c0ff' && maxy > 78) console.log('LIGHTBLUE-LOWER d="' + d + '"');
}
// Also show whether 'dashed' pen object is mutated: probe pen addition
