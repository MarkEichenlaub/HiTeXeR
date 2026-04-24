const fs = require('fs');
const src = fs.readFileSync('comparison/asy_src/12728.asy','utf8');
const { runAsyProgram } = require('./asy-interp.js');
try {
  const r = runAsyProgram(src, {debug: false});
  // count fills
  let fills = 0, total = 0;
  if (r.picture && r.picture.commands) {
    for (const c of r.picture.commands) {
      total++;
      if (c.cmd === 'fill') fills++;
    }
  }
  console.log('Total commands on currentpic:', total);
  console.log('Fill commands:', fills);
} catch(e) {
  console.error('Error:', e.message);
}
