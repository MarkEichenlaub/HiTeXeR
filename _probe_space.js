'use strict';
const katex = require('katex');
const t = katex.__renderToDomTree('\\text{0 0 0}', { throwOnError: false, output: 'html' });
(function walk(n, d) {
  if (!n) return;
  if (n.text !== undefined) console.log(' '.repeat(d), 'SYM', JSON.stringify(n.text), 'w=', n.width, 'cls=', (n.classes || []).join('.'));
  else console.log(' '.repeat(d), (n.classes || []).join('.') || 'span', n.style && Object.keys(n.style).length ? JSON.stringify(n.style) : '');
  (n.children || []).forEach(c => walk(c, d + 1));
})(t, 0);

// Oracle truth: real TeX interword space in a 12pt label
console.log('\ncmr fontdimen2 (interword) = 0.3333em; KaTeX space glyph = 0.25em');

// What the emitter measures for the actual 05896 label text segment:
global.window = global;
require('./asy-interp.js');
require('./htx-doc-render.js');
const ks = global.window.katexSvg;
const m1 = ks.measure('\\text{0 0 0 1 2 3 4 5 6 7 8.0 0 }');
console.log('measure text run widthEm:', m1 && m1.widthEm.toFixed(4));
