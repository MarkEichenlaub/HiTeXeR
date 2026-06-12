'use strict';
// Dump KaTeX DomTree structure for emitter design. usage: node _kdump.js 'tex'
const katex = require('katex');
const tex = process.argv[2] || '\\frac{1}{2}';
function walk(n, d) {
  const pad = '  '.repeat(d);
  const cls = (n.classes || []).join('.');
  const sty = n.style && Object.keys(n.style).length ? ' sty=' + JSON.stringify(n.style) : '';
  if (n.text !== undefined && !n.children) {
    console.log(pad + 'SYM ' + JSON.stringify(n.text) + ' cls=' + cls + ' h=' + (+n.height).toFixed(3) + ' d=' + (+n.depth).toFixed(3) + ' it=' + (+n.italic).toFixed(3) + ' sk=' + (+n.skew).toFixed(3) + ' w=' + (n.width != null ? (+n.width).toFixed(3) : '-') + ' maxFS=' + n.maxFontSize + sty);
  } else if (n.attributes && n.attributes.viewBox !== undefined || (n.attributes && n.attributes.width !== undefined)) {
    console.log(pad + 'SVGNODE attrs=' + JSON.stringify(n.attributes) + sty);
  } else if (n.pathName !== undefined) {
    console.log(pad + 'PATH ' + n.pathName);
  } else {
    console.log(pad + 'SPAN cls=' + cls + ' h=' + (n.height != null ? (+n.height).toFixed(3) : '-') + ' d=' + (n.depth != null ? (+n.depth).toFixed(3) : '-') + ' w=' + (n.width != null ? (+n.width).toFixed(3) : '-') + ' maxFS=' + (n.maxFontSize || '-') + sty);
  }
  for (const c of (n.children || [])) walk(c, d + 1);
}
walk(katex.__renderToDomTree(tex, { throwOnError: false, displayMode: false, output: 'html' }), 0);
