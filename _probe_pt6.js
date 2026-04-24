const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };

let src = fs.readFileSync('asy-interp.js','utf8');
// Debug the picture branch of point
src = src.replace(
  "if (args.length >= 2 && args[0] && args[0]._tag === 'picture' && isPair(args[1])) {",
  "if (args.length >= 2 && args[0] && args[0]._tag === 'picture' && isPair(args[1])) { process.stderr.write('[point-pic] ncmds=' + args[0].commands.length + ' d=' + args[1].x + ',' + args[1].y + '\\n'); const _gb = getGeoBbox(args[0].commands); process.stderr.write('[point-pic] gb=' + JSON.stringify(_gb) + '\\n');"
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
