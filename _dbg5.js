global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs=require('fs');
const interp = A._createInterpreter();
const result = interp.execute(fs.readFileSync('comparison/asy_src/03281.asy','utf8'),{});
const cmds = result.drawCommands;
let i=-1;
for(const c of cmds){i++;
  if(!c._from3d && c.cmd!=='label'){
    console.log(i,c.cmd,'pen:',JSON.stringify(c.pen).slice(0,200));
    if(c.path&&c.path.segs){const segs=c.path.segs;console.log('   nseg',segs.length,'first p0',JSON.stringify(segs[0].p0),'last p3',JSON.stringify(segs[segs.length-1].p3));}
    console.log('   dashArray?',c.pen&&(c.pen.dash||c.pen.dashArray||c.pen.linetype||c.pen._dash));
  }
}
