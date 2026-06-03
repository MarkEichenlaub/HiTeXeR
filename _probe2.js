global.window = global.window || {};
global.katex = require('katex');
const fs = require('fs');
require('./asy-interp.js');
const A = global.window.AsyInterp;
function pngSize(f){const fd=fs.openSync(f,'r');try{const b=Buffer.alloc(24);fs.readSync(fd,b,0,24,0);return{w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}finally{fs.closeSync(fd);}}
for (const id of ['00026','00233','00248','03724','03738','03786','03768','06172','00247']) {
  let asy; try{asy=fs.readFileSync('comparison/asy_src/'+id+'.asy','utf8');}catch{console.log(id,'NOASY');continue;}
  const r=A.render('[asy]\n'+asy+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native',imageCache:{}});
  const iw=parseFloat((r.svg.match(/data-intrinsic-w="([^"]+)"/)||[])[1]);
  const ih=parseFloat((r.svg.match(/data-intrinsic-h="([^"]+)"/)||[])[1]);
  let t; try{t=pngSize('comparison/texer_pngs/'+id+'.png');}catch{t={w:0,h:0};}
  const htxLong=Math.round(Math.max(iw,ih)*3/5), texLong=Math.round(Math.max(t.w,t.h)*3/10);
  const wR=(iw*2/t.w).toFixed(2), hR=(ih*2/t.h).toFixed(2);
  console.log(id.padEnd(6),'htxLong='+String(htxLong).padStart(4)+'bp  texLong='+String(texLong).padStart(4)+'bp   wR='+wR+' hR='+hR);
}
