const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
import graph;
picture pic;
scale(pic,Log,Linear);
draw(pic,(1e-4,0)--(1,20));
ylimits(pic,-60,20);
xaxis(pic,"xlabel",BottomTop,LeftTicks(N=5));
yaxis(pic,"ylabel",LeftRight,RightTicks(new real[]{-60,-40,-20,0,20}));
size(pic,100,100,point(pic,SW),point(pic,NE));
write("SW=",point(pic,SW));
write("NE=",point(pic,NE));
write("N=",point(pic,N));
write("E=",point(pic,E));
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
