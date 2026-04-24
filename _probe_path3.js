const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };

// Hook into hobbySpline to print its output
let srcCode = fs.readFileSync('asy-interp.js','utf8');
srcCode = srcCode.replace(
  'function hobbySpline(knots, closed, directions) {',
  'function hobbySpline(knots, closed, directions) {\n  if (process.env.HTX_HOBBY_DBG) { process.stderr.write("[hobby] knots=" + JSON.stringify(knots.map(k=>[k.x,k.y])) + " directions=" + JSON.stringify(directions) + "\\n"); }'
);
srcCode = srcCode.replace(
  '  return segs;\n}\n\n// Hobby\'s velocity function rho(theta, phi)',
  '  if (process.env.HTX_HOBBY_DBG) { for (const s of segs) process.stderr.write("[hobbyOut] p0=(" + s.p0.x.toFixed(3) + "," + s.p0.y.toFixed(3) + ") cp1=(" + s.cp1.x.toFixed(3) + "," + s.cp1.y.toFixed(3) + ") cp2=(" + s.cp2.x.toFixed(3) + "," + s.cp2.y.toFixed(3) + ") p3=(" + s.p3.x.toFixed(3) + "," + s.p3.y.toFixed(3) + ")\\n"); }\n  return segs;\n}\n\n// Hobby\'s velocity function rho(theta, phi)'
);
eval(srcCode);

try {
  window.AsyInterp.render("draw((.2,0){1,0}..(4,.75)..{-1,0}(.2,1.5));", {format:'svg'});
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n');
}
