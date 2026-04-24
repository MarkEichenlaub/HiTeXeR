const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');

// Patch asy-interp.js to log bbox info
let interpSrc = fs.readFileSync('asy-interp.js', 'utf8');
interpSrc = interpSrc.replace(
  '// Save geometry-only bbox before label expansion (and before padding).',
  'console.error("BBOX:", "minX=", minX, "maxX=", maxX, "minY=", minY, "maxY=", maxY); console.error("axisLimits=", JSON.stringify(axisLimits)); console.error("sizeW=", sizeW, "sizeH=", sizeH, "keepAspect=", keepAspect, "hasUnitScale=", hasUnitScale);\n  // Save geometry-only bbox before label expansion (and before padding).'
);
fs.writeFileSync('_asy_patched.js', interpSrc);
require('./_asy_patched.js');
const A = window.AsyInterp;
const src = fs.readFileSync('comparison/asy_src/06495.asy', 'utf8');
const code = '[asy]\n' + src + '\n[/asy]';
const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
console.error("SVG header:", result.svg.split('\n')[1]);
