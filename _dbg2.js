global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs=require('fs');
const code = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const interp = A._createInterpreter();
const result = interp.execute(code,{});
const cmds = result.drawCommands;
function pb(p){if(!p||!p.segments)return null;let xn=1e9,xx=-1e9,yn=1e9,yx=-1e9;for(const s of p.segments){for(const kk in s){const pt=s[kk];if(pt&&typeof pt==='object'&&typeof pt.x==='number'){xn=Math.min(xn,pt.x);xx=Math.max(xx,pt.x);yn=Math.min(yn,pt.y);yx=Math.max(yx,pt.y);}}}return xn>xx?null:`x[${xn.toFixed(1)},${xx.toFixed(1)}] y[${yn.toFixed(1)},${yx.toFixed(1)}]`;}
let i=-1;
for(const c of cmds){
  i++;
  if(c.cmd==='fill') continue;
  const grey = c.pen && c.pen.r<0.99;
  const is3d=c._from3d?'3D':'2D';
  const pen=c.pen?`rgb(${(c.pen.r*255|0)},${(c.pen.g*255|0)},${(c.pen.b*255|0)})`:'';
  const lw=c.pen&&c.pen.linewidth!=null?` lw${c.pen.linewidth}`:'';
  console.log(i, is3d, c.cmd, pen+lw, pb(c.path)||'', c.cmd==='label'?JSON.stringify(c.text):'', c.arrow?'ARR':'');
}
