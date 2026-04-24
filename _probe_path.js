const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
path p = (.2,0){1,0}..(4,.75)..{-1,0}(.2,1.5);
write("p.length=",length(p));
for (int i = 0; i < length(p); ++i) {
  write("seg[",i,"]:");
  write("  p0 = ",point(p,i));
  pair po = postcontrol(p,i);
  write("  post = ",po);
  pair pr = precontrol(p,i+1);
  write("  pre = ",pr);
}
write("  pEnd = ",point(p,length(p)));
`;

try {
  const r = window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
