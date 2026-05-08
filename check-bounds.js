const path = require('path');
const fs = require('fs');
const ROOT = __dirname;

global.window = global.window || {};
global.katex = require('katex');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;

const asyCode = fs.readFileSync('comparison/asy_src/00971.asy', 'utf8');
const testCode = '[asy]\n' + asyCode + '\n[/asy]';

const result = A.render(testCode, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });

// Parse SVG and extract the blue path's y-bounds
const bluePathMatch = result.svg.match(/<path[^>]*stroke="#0000ff"[^>]*d="([^"]+)"/);
if (bluePathMatch) {
  const d = bluePathMatch[1];
  const coords = d.match(/[LMC]?[\s]*([0-9.]+)\s+([0-9.]+)/g);
  let minY = Infinity, maxY = -Infinity;
  for (const c of coords) {
    const parts = c.trim().replace(/^[LMC]\s*/, '').split(/\s+/);
    const y = parseFloat(parts[1]);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  console.log('Blue path Y bounds in SVG coords:', minY.toFixed(2), 'to', maxY.toFixed(2));
}

// Get viewBox
const vbMatch = result.svg.match(/viewBox="([^"]+)"/);
if (vbMatch) {
  const [vx, vy, vw, vh] = vbMatch[1].split(/\s+/).map(Number);
  console.log('ViewBox:', vx, vy, vw, vh);
}

// Get black paths (axes) - stroke may be in different order
const blackPaths = result.svg.match(/<path[^>]*stroke-width="2"[^>]*>/g);
console.log('Black paths (axes):', blackPaths ? blackPaths.length : 0);
if (blackPaths) {
  blackPaths.forEach((p, i) => {
    const d = p.match(/d="([^"]+)"/);
    console.log('  Axis', i+1, ':', d ? d[1] : 'no d');
  });
}
