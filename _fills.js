global.window = {};
require('./asy-interp.js');
const fs = require('fs');
const A = global.window.AsyInterp;
const code = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const out = A.render(code, {});
const svg = out.svg;
// extract path fills
const re = /<path[^>]*fill="([^"]*)"[^>]*\/?>/g;
let m, i=0;
const counts = {};
while ((m = re.exec(svg))) {
  const f = m[1];
  counts[f] = (counts[f]||0)+1;
}
console.log(JSON.stringify(counts, null, 2));
