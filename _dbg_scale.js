const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
pair exp(pair x) { return exp(x.x)*(cos(x.y)+I*sin(x.y)); }
write("exp(real 0) = ", exp(0));
write("exp((0,0)) = ", exp((0,0)));
write("exp((0, 0.001)) = ", exp((0.0, 0.001)));
write("exp((1, 0)) = ", exp((1, 0)));
`;

try {
  const r = window.AsyInterp.render(asy, {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n');
}
