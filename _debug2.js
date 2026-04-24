global.window = global.window || {};
global.katex = require('katex');
// Patch the asy-interp code to inject logging
const fs = require('fs');
let src = fs.readFileSync('asy-interp.js','utf8');
// Inject log at start of renderMeshToPicture
src = src.replace(
  'function renderMeshToPicture(mesh, basePen, target, line) {',
  'function renderMeshToPicture(mesh, basePen, target, line) { console.error("renderMeshToPicture pen:", JSON.stringify({r:basePen.r,g:basePen.g,b:basePen.b,tag:basePen._tag}), "faces:", mesh && mesh.faces && mesh.faces.length);'
);
fs.writeFileSync('_asy_interp_patched.js', src);
require('./_asy_interp_patched.js');
const A = window.AsyInterp;
const raw = fs.readFileSync('comparison/asy_src/12845.asy', 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';
A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
