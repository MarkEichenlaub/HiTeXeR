const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
eval(fs.readFileSync('asy-interp.js','utf8'));

const asy = `
path p = (.2,0){1,0}..(4,.75)..{-1,0}(.2,1.5);
__dumpPath(p);
`;

// Inject __dumpPath
const env = window.AsyInterp;

try {
  // We can't easily call back into the parser's env. Instead intercept draw.
  // Redirect: render then inspect commands via internal API
  const svg = env.render("draw((.2,0){1,0}..(4,.75)..{-1,0}(.2,1.5));", {format:'svg', returnDebug:true});
  // Print paths
  if (env._debugLastCommands) {
    for (const c of env._debugLastCommands) {
      if (c.path) {
        for (const s of c.path.segs) {
          console.log('seg p0=(', s.p0.x, s.p0.y, ') cp1=(', s.cp1.x, s.cp1.y, ') cp2=(', s.cp2.x, s.cp2.y, ') p3=(', s.p3.x, s.p3.y, ')');
        }
      }
    }
  } else {
    console.log('no debug export');
    console.log('SVG:', svg.slice(0, 500));
  }
} catch(e) {
  process.stderr.write('EXC: '+e.message+'\n'+e.stack+'\n');
}
