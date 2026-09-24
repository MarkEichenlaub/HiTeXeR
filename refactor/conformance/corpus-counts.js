'use strict';
// Counts how many corpus diagrams (comparison/asy_src/*.asy) use each construct,
// so REPORT.md can order mismatches by how much they matter.
//   node refactor/conformance/corpus-counts.js [name ...]   -> prints JSON
// With no names, counts every identifier followed by "(" plus a few operators,
// and writes corpus-counts.json next to this script.
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '..', '..', 'comparison', 'asy_src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.asy'));
const srcs = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/[^\n]*/g, ''));

const names = process.argv.slice(2);
const counts = {};
const specials = {
  'import olympiad': /import\s+olympiad/, 'import geometry': /import\s+geometry/,
  'import cse5': /import\s+cse5/, 'import graph': /import\s+graph/, 'import three': /import\s+three/,
  'int/int': /\b\d+\s*\/\s*\d+\b/, '#': /[\w)]\s*#\s*[\w(]/, '%': /[\w)]\s*%\s*[\w(]/,
  '^^': /\^\^/, '---': /---/, '::': /::/, 'tension': /\btension\b/, 'curl': /\bcurl\b/,
  'controls': /\bcontrols\b/, '..cycle': /\.\.\s*cycle/, '--cycle': /--\s*cycle/,
  'dir(path,t)': /\bdir\s*\(\s*[A-Za-z_]\w*\s*,/, 'min/max(ident)': /\b(min|max)\s*\(\s*[A-Za-z_]\w*\s*\)/,
  '(int)': /\(\s*int\s*\)/, 'Npt': /\d\s*pt\b/, 'pen getter': /(linewidth|fontsize)\s*\(\s*(currentpen|defaultpen|p|q)\s*\)/,
  'pair=number': /\bpair\s+\w+\s*=\s*-?[\d.]+\s*;/, 'array append/insert/delete': /\.(append|insert|delete)\s*\(/,
  'for comma': /for\s*\([^;)]*,[^;)]*;/, 'rest args': /\.\.\.\s*\w+\s*\[\]/,
  'string(real,n)': /\bstring\s*\([^()]*(\([^()]*\))?[^()]*,\s*\d+\s*\)/, 'format(': /\bformat\s*\(/,
  'struct method': /struct\s+\w+\s*\{[^}]*\([^)]*\)\s*\{/,
  'point(circle': /point\s*\(\s*(circle|Circle|unitcircle|circumcircle|incircle|CR)\b/,
  'for': /\bfor\s*\(/, 'while': /\bwhile\s*\(/, 'struct': /\bstruct\s+\w/, 'operator': /\boperator\s*[^\w\s]/,
  'string+': /"\s*\+|\+\s*"/, 'write(': /\bwrite\s*\(/, '++': /\+\+/, '+=': /\+=/, 'ternary': /\?[^:;]*:/,
  '{dir}': /\{\s*(dir|up|down|left|right)\b/, 'array literal {': /=\s*\{/, 'new T[]': /new\s+\w+\s*\[/,
};
if (names.length) {
  for (const n of names) {
    const re = specials[n] || new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
    counts[n] = srcs.filter(s => re.test(s)).length;
  }
  console.log(JSON.stringify(counts, null, 1));
} else {
  const re = /\b([A-Za-z_]\w*)\s*\(/g;
  for (const s of srcs) {
    const seen = new Set();
    let m;
    while ((m = re.exec(s))) seen.add(m[1]);
    for (const k of seen) counts[k] = (counts[k] || 0) + 1;
  }
  for (const [k, re2] of Object.entries(specials)) counts['[' + k + ']'] = srcs.filter(s => re2.test(s)).length;
  const sorted = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
  fs.writeFileSync(path.join(__dirname, 'corpus-counts.json'), JSON.stringify({files: files.length, counts: sorted}, null, 1));
  console.log(files.length + ' files; top 150:');
  console.log(Object.entries(sorted).slice(0, 150).map(([k, v]) => k + ':' + v).join('  '));
}
