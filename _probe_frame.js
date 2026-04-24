const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
picture pic1;
size(pic1,100,100,point(pic1,SW),point(pic1,NE));
draw(pic1,(0,0)--(1,1));
label(pic1,"\$\theta=1\$",point(pic1,N),2N);
frame f1=pic1.fit();
write("max(f1).x=",max(f1).x);
write("min(f1).x=",min(f1).x);
write("max(f1).y=",max(f1).y);
write("min(f1).y=",min(f1).y);
`;

try {
  window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
