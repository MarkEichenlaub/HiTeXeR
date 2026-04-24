const fs = require('fs');
const { interpret } = require('./asy-interp.js');
const src = fs.readFileSync('comparison/asy_src/06495.asy', 'utf8');
// Patch to log bbox info
const orig = interpret;
const result = interpret(src);
// Print first few lines of svg
const lines = result.svg.split('\n').slice(0,4);
console.log(lines.join('\n'));
