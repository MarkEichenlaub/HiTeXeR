global.window = {}; const katex = require('katex');
const tex = process.argv[2] || '\\overset{\\uparrow}{l(1 - \\cos\\theta)}';
const html = katex.renderToString(tex, { trust: true, strict: false, output: 'html' });
let depth = 0; const re = /<span([^>]*)>|<\/span>/g; let m;
while ((m = re.exec(html))) {
  if (m[0] === '</span>') { depth--; continue; }
  const attrs = m[1];
  const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1];
  const sty = (attrs.match(/style="([^"]*)"/) || [, ''])[1];
  if (/margin|width|top/.test(sty) || /vlist|sizing|mop|brace|stretchy/.test(cls))
    console.log('  '.repeat(depth) + (cls ? '.' + cls.replace(/ /g, '.') : '(span)') + (sty ? '  {' + sty + '}' : ''));
  depth++;
}
