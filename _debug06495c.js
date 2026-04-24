const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');

let interpSrc = fs.readFileSync('asy-interp.js', 'utf8');
// Add log inside the iteration
interpSrc = interpSrc.replace(
  'for (let iter = 0; iter < 5; iter++) {',
  'console.error("BEFORE_SOLVER pxX=", pxPerUnitX, "pxY=", pxPerUnitY, "labels=", labelInfoBp.length); for (let iter = 0; iter < 5; iter++) {'
);
interpSrc = interpSrc.replace(
  'if (exceed <= 1.005) break; // fits within tolerance',
  'console.error("ITER", iter, "exceedW=", exceedW, "exceedH=", exceedH, "totalW=", totalW, "totalH=", totalH, "pxX=", pxPerUnitX, "pxY=", pxPerUnitY); if (exceed <= 1.005) break; // fits within tolerance'
);
interpSrc = interpSrc.replace(
  'if (finalExceed > 1.005) {\n      pxPerUnit = preSolverPxPerUnit;',
  'console.error("LABEL_DOMINATED finalExceed=", finalExceed, "needsBoost soon"); if (finalExceed > 1.005) {\n      pxPerUnit = preSolverPxPerUnit;'
);
interpSrc = interpSrc.replace(
  'if (needsBoost > 1.005) {',
  'console.error("NEEDS_BOOST=", needsBoost); if (needsBoost > 1.005) {'
);
fs.writeFileSync('_asy_patched.js', interpSrc);
delete require.cache[require.resolve('./_asy_patched.js')];
require('./_asy_patched.js');
const A = window.AsyInterp;
const src = fs.readFileSync('comparison/asy_src/06495.asy', 'utf8');
const code = '[asy]\n' + src + '\n[/asy]';
const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
console.error("SVG header:", result.svg.split('\n')[1]);
