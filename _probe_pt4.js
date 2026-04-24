const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

// Patch getGeoBbox to log  
const origSource = fs.readFileSync('asy-interp.js','utf8');
const patched = origSource.replace(
  "function getGeoBbox(commands) {",
  "function getGeoBbox(commands) { if (process.env.HTX_BBOX_DBG) { process.stderr.write('[getGeoBbox] ncmds='+commands.length+'\n'); for (const c of commands) process.stderr.write('  cmd='+c.cmd+' hasPath='+!!c.path+' pos='+JSON.stringify(c.pos||null)+'\n'); }"
);
eval(patched);

const asy = `
import graph;
picture pic;
scale(pic,Log,Linear);
real f(real x){return x;}
draw(pic,graph(pic,f,1e-4,1),black);
ylimits(pic,-60,20);
write("check");
pair psw = point(pic,SW);
write("SW=",psw.x,psw.y);
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
