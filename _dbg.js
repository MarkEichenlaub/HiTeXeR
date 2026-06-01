global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs=require('fs');
const code = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const interp = A._createInterpreter();
const result = interp.execute(code,{});
const cmds = result.drawCommands;
console.log('total cmds',cmds.length);
function pathBounds(p){if(!p||!p.segments)return null;let xn=1e9,xx=-1e9,yn=1e9,yx=-1e9;for(const s of p.segments){for(const k of ['p0','cp1','cp2','p3','p1']){const pt=s[k];if(pt){xn=Math.min(xn,pt.x);xx=Math.max(xx,pt.x);yn=Math.min(yn,pt.y);yx=Math.max(yx,pt.y);}}}return {xn:xn.toFixed(2),xx:xx.toFixed(2),yn:yn.toFixed(2),yx:yx.toFixed(2)};}
let i=0;
for(const c of cmds){
  const is3d=c._from3d?'3D':'2D';
  const pen=c.pen?`rgb(${(c.pen.r*255|0)},${(c.pen.g*255|0)},${(c.pen.b*255|0)})${c.pen.opacity!=null?' op'+c.pen.opacity:''}`:'';
  const fd=c._faceDepth!=null?` d=${c._faceDepth.toFixed(2)}`:'';
  const b=pathBounds(c.path);
  console.log(i++, is3d, c.cmd, pen, fd, b?`x[${b.xn},${b.xx}] y[${b.yn},${b.yx}]`:'', c.cmd==='label'?JSON.stringify(c.text):'');
  if(i>80){console.log('...');break;}
}
