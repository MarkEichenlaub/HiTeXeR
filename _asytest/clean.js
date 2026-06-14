const fs = require('fs');
let s = fs.readFileSync('t03385.asy', 'utf8');
const i = s.indexOf('xAxisRightArrow){');
console.log('bytes around:', JSON.stringify(s.slice(i - 30, i + 5)));
// Remove stray backslashes that precede a tab or space (corpus artifact)
s = s.replace(/\\(?=[\t ])/g, '');
// Also handle literal backslash-t (two chars)
s = s.replace(/\\t/g, '');
fs.writeFileSync('t03385c.asy', s);
console.log('remaining backslashes in first 3000:', (s.slice(0, 3000).match(/\\/g) || []).length);
