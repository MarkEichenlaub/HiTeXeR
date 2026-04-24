'use strict';
const fs=require('fs');
global.window={}; global.document={createElement:()=>({getContext:()=>null})};
require('./asy-interp.js');
const ssim=JSON.parse(fs.readFileSync('comparison/ssim-results.json','utf8'));
const byId={};
for(const r of ssim) byId[r.id]=r;

// Sample IgnoreAspect and other diagrams
const samples=['00050','00115','00118','00254','00430','00444','00445','01937','03567','03887','03892','05122','07399','12533','00001','00002','07710','09343','12274','12725'];
console.log('id      | baseSSIM | outerAsp | rangeStr');
for(const id of samples){
  const asyPath='comparison/asy_src/'+id+'.asy';
  if(!fs.existsSync(asyPath)) { console.log(id,'NO SRC'); continue; }
  const src=fs.readFileSync(asyPath,'utf8');
  let r;
  try { r=window.AsyInterp.render(src,{format:'svg'}); } catch(e){ console.log(id,'ERR',e.message); continue; }
  const svg=typeof r==='string'?r:r.svg;
  const m=svg.match(/width="([0-9.]+)"\s+height="([0-9.]+)"/);
  const asp = m ? (parseFloat(m[1])/parseFloat(m[2])) : 0;
  const base = byId[id] ? byId[id].ssim : null;
  const hasIgnAsp = /IgnoreAspect/.test(src);
  console.log(id, (base!==null?base.toFixed(3):'N/A'), 'asp='+asp.toFixed(3), 'dims='+(m?m[1]+'x'+m[2]:'?'), (hasIgnAsp?'IgnAsp':''));
}
