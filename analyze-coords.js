const path = require('path');
const fs = require('fs');
const ROOT = __dirname;

global.window = global.window || {};
global.katex = require('katex');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;

// Read the actual source
const asyCode = fs.readFileSync('comparison/asy_src/00971.asy', 'utf8');

const testCode = '[asy]\n' + asyCode + '\n[/asy]';

try {
  const result = A.render(testCode, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
  
  // Parse the viewBox
  const vbMatch = result.svg.match(/viewBox="([^"]+)"/);
  const widthMatch = result.svg.match(/\swidth="([^"]+)"/);
  const heightMatch = result.svg.match(/\sheight="([^"]+)"/);
  console.log('viewBox:', vbMatch ? vbMatch[1] : 'not found');
  console.log('width:', widthMatch ? widthMatch[1] : 'not found');
  console.log('height:', heightMatch ? heightMatch[1] : 'not found');
  
  // Find the axes paths
  const axesPaths = result.svg.match(/<path[^>]*stroke="#000000"[^>]*stroke-width="2"[^>]*>/g);
  console.log('Axes paths found:', axesPaths ? axesPaths.length : 0);
  if (axesPaths) {
    axesPaths.forEach((p, i) => {
      const d = p.match(/d="([^"]+)"/);
      console.log('Axis', i+1, ':', d ? d[1] : 'no d');
    });
  }
  
} catch(e) {
  console.log('Error:', e.message, e.stack);
}
