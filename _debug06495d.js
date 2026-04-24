const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');

let interpSrc = fs.readFileSync('asy-interp.js', 'utf8');
interpSrc = interpSrc.replace(
  'if (yOverlap <= 0) continue; // already clear',
  'console.error("OVERLAP a=", JSON.stringify({posX:a.posX,posY:a.posY,wBp:a.widthBp,hBp:a.heightBp,t:a._text}), "b=", JSON.stringify({posX:b.posX,posY:b.posY,wBp:b.widthBp,hBp:b.heightBp,t:b._text}), "dy=", dy, "yOverlap=", yOverlap, "halfAH=", halfAH, "halfBH=", halfBH); if (yOverlap <= 0) continue; // already clear'
);
fs.writeFileSync('_asy_patched.js', interpSrc);
delete require.cache[require.resolve('./_asy_patched.js')];
require('./_asy_patched.js');
const A = window.AsyInterp;
const src = fs.readFileSync('comparison/asy_src/06495.asy', 'utf8');
const code = '[asy]\n' + src + '\n[/asy]';
const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native' });
