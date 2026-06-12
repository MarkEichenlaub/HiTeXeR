'use strict';
const fs = require('fs');
const katexSvg = require('./katex-svg.js');
katexSvg.init(JSON.parse(fs.readFileSync('katex-glyphs.json', 'utf8')));
const cases = ['\\frac{', '\\begin{matrix}a&b\\\\c&d\\end{matrix}', '\\unknowncmd{x}', '', 'a&b', 'x<y', '5\\%', '\\text{a<b&c}'];
for (const tex of cases) {
  let r = null, err = null;
  try { r = katexSvg.render(tex, { emPx: 12 }); } catch (e) { err = e.message; }
  console.log(JSON.stringify(tex).slice(0, 40).padEnd(42), err ? ('THROW ' + err.slice(0, 50)) : (r ? ('ok w=' + r.widthEm.toFixed(2)) : 'null->fallback'));
}
