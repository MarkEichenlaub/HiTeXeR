'use strict';
const fs = require('fs');
const path = require('path');
global.window = {};
require('./asy-interp.js');
const A = window.AsyInterp;

const dir = 'asy_corpus';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.asy'));
const parseErrors = [];
const recursionErrors = [];
const otherErrors = [];

for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  try {
    if (!A.canInterpret(code)) continue;
    A.render(code, {containerW:500, containerH:400});
  } catch(e) {
    const msg = (e.message||'').split('\n')[0].substring(0,200);
    const endChar = raw.trimEnd().slice(-1);
    if (msg.includes('Parse error') || msg.includes('expected')) {
      parseErrors.push({file:f, msg, endChar});
    } else if (msg.includes('recursion')) {
      recursionErrors.push(f);
    } else {
      otherErrors.push({file:f, msg});
    }
  }
}

console.log('Parse errors:', parseErrors.length);
for (const p of parseErrors) {
  console.log('  ' + p.file + ' [ends:' + p.endChar + '] ' + p.msg);
}
console.log('\nRecursion:', recursionErrors.length);
console.log('\nOther:', otherErrors.length);
for (const o of otherErrors) {
  console.log('  ' + o.file + ' ' + o.msg);
}
