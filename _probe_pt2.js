const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
import graph;
picture pic;
scale(pic,Log,Linear);
real f(real x){return x;}
draw(pic,graph(pic,f,1e-4,1),black);
ylimits(pic,-60,20);
xaxis(pic,"xlabel",BottomTop,LeftTicks(N=5));
yaxis(pic,"ylabel",LeftRight,RightTicks(new real[]{-60,-40,-20,0,20}));
write("before size: SW=",point(pic,SW),"NE=",point(pic,NE),"N=",point(pic,N));
size(pic,100,100,point(pic,SW),point(pic,NE));
write("after size: cmds=",pic.commands.length);
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
