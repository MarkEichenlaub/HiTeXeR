global.window = {}; const katex = require('katex');
const tex = process.argv[2] || '\\overset{\\uparrow}{l(1 - \\cos\\theta)}';
const tree = katex.__renderToDomTree(tex, { trust: true, strict: false });
function walk(n, depth) {
  if (!n) return;
  const pad = '  '.repeat(depth);
  const cls = (n.classes || []).join(' ');
  const tag = n.constructor && n.constructor.name;
  const style = n.style ? JSON.stringify(n.style) : '';
  const w = (typeof n.width === 'number') ? ' W=' + n.width.toFixed(4) : '';
  const txt = n.text ? ' "' + n.text + '"' : '';
  if (cls.indexOf('mathml') !== -1) return; // skip mathml subtree
  console.log(pad + tag + (cls ? ' .' + cls : '') + w + txt + (style && style !== '{}' ? ' style=' + style : ''));
  const kids = n.children || (n.body && Array.isArray(n.body) ? n.body : null);
  if (kids) for (const k of kids) walk(k, depth + 1);
}
walk(tree, 0);
