global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs=require('fs');
const out = A.render(fs.readFileSync('comparison/asy_src/03281.asy','utf8'),{});
console.log('render keys', Object.keys(out));
const svg = out.svg||out.svgString||out.output||'';
fs.writeFileSync('_03281.svg',svg);
let n=0;for(const l of svg.split('\n')){ if(/dash/i.test(l)){console.log('DASH:',l.slice(0,220));n++;if(n>5)break;} }
console.log('dash lines:',n,'svg len',svg.length);
