global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs=require('fs');
const interp = A._createInterpreter();
const result = interp.execute(fs.readFileSync('comparison/asy_src/03281.asy','utf8'),{});
const cmds = result.drawCommands;
function pb(p){if(!p||!p.segs)return null;let xn=1e9,xx=-1e9,yn=1e9,yx=-1e9;for(const s of p.segs){for(const k of['p0','cp1','cp2','p3']){const pt=s[k];if(pt){xn=Math.min(xn,pt.x);xx=Math.max(xx,pt.x);yn=Math.min(yn,pt.y);yx=Math.max(yx,pt.y);}}}return {xn,xx,yn,yx};}
// aggregate by category
const cats={};
let i=-1;
for(const c of cmds){i++;
  const r=c.pen?Math.round(c.pen.r*255):-1, g=c.pen?Math.round(c.pen.g*255):-1, b=c.pen?Math.round(c.pen.b*255):-1;
  let cat;
  if(c.cmd==='label') cat='label';
  else if(!c._from3d) cat='2D-'+c.cmd;
  else if(r===204) cat='grid204';
  else if(r<50) cat='blackEdge';
  else if(c.cmd==='fill') cat='fill';
  else cat='wstroke';
  const bb=pb(c.path);
  if(!cats[cat])cats[cat]={n:0,xn:1e9,xx:-1e9,yn:1e9,yx:-1e9,idxs:[]};
  const C=cats[cat];C.n++;if(bb){C.xn=Math.min(C.xn,bb.xn);C.xx=Math.max(C.xx,bb.xx);C.yn=Math.min(C.yn,bb.yn);C.yx=Math.max(C.yx,bb.yx);}
  if(C.idxs.length<3)C.idxs.push(i);
}
for(const k in cats){const C=cats[k];console.log(k.padEnd(10),'n='+C.n, `x[${C.xn.toFixed(2)},${C.xx.toFixed(2)}] y[${C.yn.toFixed(2)},${C.yx.toFixed(2)}]`,'idx',C.idxs.join(','));}
// also dump labels & 2D draws individually
console.log('--- 2D & labels ---');
i=-1;for(const c of cmds){i++; if(c.cmd==='label'){const bb=pb(c.path);console.log(i,'label',JSON.stringify(c.text),'at',c.x!=null?`(${c.x.toFixed?c.x.toFixed(2):c.x},${c.y})`:'');}
 else if(!c._from3d){const bb=pb(c.path);console.log(i,'2D',c.cmd,c.pen?`rgb(${Math.round(c.pen.r*255)})`:'',bb?`x[${bb.xn.toFixed(2)},${bb.xx.toFixed(2)}] y[${bb.yn.toFixed(2)},${bb.yx.toFixed(2)}]`:'',c.arrow?'ARR':'');}}
