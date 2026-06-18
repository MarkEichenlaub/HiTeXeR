global.window = {};
global.katex = require('katex');
const katexSvg = require('./katex-svg.js');
const fs = require('fs');
const path = require('path');
katexSvg.init(JSON.parse(fs.readFileSync(path.join(__dirname, 'katex-glyphs.json'), 'utf8')));
const k = global.katex;
const tree = k.__renderToDomTree('\\underbrace{\\hspace{2cm}}_{2}', { throwOnError: false, displayMode: false, output: 'html' });
function dump(n, d) {
  if (d > 14) return;
  const cls = (n.classes || []).join('.');
  const st = n.style || {};
  const styleBits = [];
  for (const kk in st) if (st[kk] !== undefined && st[kk] !== '') styleBits.push(kk + '=' + st[kk]);
  const wa = n.attributes && n.attributes.width;
  console.log('  '.repeat(d) + (n.type || '?') + ' [' + cls + ']' + (styleBits.length ? ' {' + styleBits.join(',') + '}' : '') + (wa ? ' ATTRw=' + wa : '') + (n.text ? (' TEXT=' + JSON.stringify(n.text)) : ''));
  for (const c of (n.children || [])) dump(c, d + 1);
}
dump(tree, 0);
