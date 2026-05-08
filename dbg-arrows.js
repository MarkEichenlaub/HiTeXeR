const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname);

global.window = global.window || {};
global.katex = require('katex');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;

const asyPath = path.join(ROOT, 'comparison/asy_src/06081.asy');
const raw = fs.readFileSync(asyPath, 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';

const result = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });

// Parse SVG to extract viewBox
const vbMatch = result.svg.match(/viewBox="([^"]+)"/);
const widthMatch = result.svg.match(/width="([^"]+)"/);
console.log('viewBox:', vbMatch?.[1]);
console.log('width:', widthMatch?.[1]);

// The SVG scaling info
const iw = result.svg.match(/data-intrinsic-w="([^"]+)"/);
const ih = result.svg.match(/data-intrinsic-h="([^"]+)"/);
console.log('intrinsic-w:', iw?.[1]);
console.log('intrinsic-h:', ih?.[1]);
