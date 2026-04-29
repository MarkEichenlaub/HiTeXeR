global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/12726.asy', 'utf8');
const r = A.render(raw, { containerW: 800, containerH: 600, labelOutput: 'svg-native', format: 'svg', debug:true });
const svg = typeof r === 'string' ? r : r.svg;
// Look for y-axis tick "-1" position.
// Find all <text> elements at left side that look like y-axis labels.
const txtRe = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([+-]?[0-9.]+)<\/text>/g;
let m;
let leftLabels = [];
while ((m = txtRe.exec(svg)) !== null) {
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  const v = m[3];
  if (x < 30) leftLabels.push({x,y,v});
}
console.log('left labels:', leftLabels);

// Find all axis-line paths (vertical lines)
const pathRe = /<path[^>]+d="M([^A-Z]*?)L([^"]*?)"[^>]*\/>/g;
let cnt = 0;
while ((m = pathRe.exec(svg)) !== null && cnt < 30) {
  const startCoords = m[1].trim().split(/[\s,]+/).map(Number);
  const endCoords = m[2].trim().split(/[\s,]+/).map(Number);
  if (startCoords.length === 2 && endCoords.length === 2) {
    if (Math.abs(startCoords[0] - endCoords[0]) < 0.01 && Math.abs(startCoords[1] - endCoords[1]) > 50) {
      // vertical line
      console.log(`vert line at x=${startCoords[0]}: y=${startCoords[1]} → y=${endCoords[1]}`);
      cnt++;
    }
  }
}
