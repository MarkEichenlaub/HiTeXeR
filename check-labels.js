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

// Find SVG labels
const labelSvgs = result.svg.match(/<svg[^>]*x="[^"]*"[^>]*y="[^"]*"[^>]*>/g);
console.log('Labels found:', labelSvgs ? labelSvgs.length : 0);
if (labelSvgs) {
  labelSvgs.forEach((l, i) => {
    const x = l.match(/\sx="([^"]+)"/);
    const y = l.match(/\sy="([^"]+)"/);
    const w = l.match(/\swidth="([^"]+)"/);
    const h = l.match(/\sheight="([^"]+)"/);
    console.log('Label', i+1, ': x=', x?x[1]:'?', 'y=', y?y[1]:'?', 'w=', w?w[1]:'?', 'h=', h?h[1]:'?');
  });
}

// Extract viewBox from full svg
const vb = result.svg.match(/<svg[^>]*viewBox="([^"]+)"/);
console.log('Main viewBox:', vb ? vb[1] : 'not found');
