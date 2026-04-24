global.window = {};
global.katex = require('katex');
// patch render to log bbox
const orig = require('fs').readFileSync('./asy-interp.js', 'utf8');
const patched = orig.replace(
  'const naturalW = (maxX - minX) * pxPerUnitX;',
  'console.log("BBOX: minX=",minX,"maxX=",maxX,"minY=",minY,"maxY=",maxY,"pxPerUnit=",pxPerUnitX,pxPerUnitY,"unitScale=",unitScale,"sizeW=",sizeW,"sizeH=",sizeH,"unitsizeBoostScale=",unitsizeBoostScale); const naturalW = (maxX - minX) * pxPerUnitX;'
);
require('fs').writeFileSync('_asy_patched.js', patched);
require('./_asy_patched.js');
const A = window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/07709.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';
const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
