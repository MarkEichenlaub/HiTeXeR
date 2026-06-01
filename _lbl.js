global.window = {};
require('./asy-interp.js');
const fs = require('fs');
const A = global.window.AsyInterp;
const code = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const out = A.render(code, {});
const svg = out.svg;
const re = /<text[^>]*>[\s\S]*?<\/text>/g;
let m;
while((m=re.exec(svg))){ console.log('---'); console.log(m[0].slice(0,300)); }
