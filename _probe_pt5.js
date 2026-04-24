const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };

let src = fs.readFileSync('asy-interp.js','utf8');
// Inject a debug log inside getGeoBbox
src = src.replace(
  'function getGeoBbox(commands) {',
  'function getGeoBbox(commands) {\n    if (process.env.HTX_BBOX_DBG) { process.stderr.write("[getGeoBbox] ncmds=" + commands.length + "\\n"); for (const c of commands) { process.stderr.write("  cmd=" + c.cmd + " hasPath=" + !!c.path + "\\n"); } }'
);
eval(src);

const asy = `
import graph;
picture pic;
scale(pic,Log,Linear);
real f(real x){return x;}
draw(pic,graph(pic,f,1e-4,1),black);
ylimits(pic,-60,20);
pair psw = point(pic,SW);
write("SW=",psw.x,psw.y);
pair pne = point(pic,NE);
write("NE=",pne.x,pne.y);
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
