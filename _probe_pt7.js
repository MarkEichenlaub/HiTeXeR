const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };

let src = fs.readFileSync('asy-interp.js','utf8');
// Simpler debug: log when point is called  
const marker = "env.set('point', (...args) => {\n      // point(picture, dir): return the user-coord bbox point in that direction.";
const injected = "env.set('point', (...args) => {\n      process.stderr.write('[point] nargs=' + args.length + ' arg0Type=' + (args[0] && args[0]._tag) + ' arg1=' + JSON.stringify(args[1]) + '\n');\n      // point(picture, dir): return the user-coord bbox point in that direction.";
src = src.replace(marker, injected);
eval(src);

const asy = `
picture pic;
draw(pic,(0,0)--(10,20));
pair psw = point(pic,SW);
write("SW=",psw.x,psw.y);
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n');
}
