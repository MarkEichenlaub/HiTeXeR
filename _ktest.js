'use strict';
// Standalone emitter test: render specimens to a sheet PNG for visual check.
const fs = require('fs');
const katexSvg = require('./katex-svg.js');
katexSvg.init(JSON.parse(fs.readFileSync('katex-glyphs.json', 'utf8')));
const blink = require('./blink-raster.js');

const SPECIMENS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '-5', 'x', 'f(x)=2x-3', '\\frac{1}{2}', '\\sqrt{2}', '\\sqrt{x+1}',
  'x^2', 'x_1', 'A_{n+1}^{2}', '\\sin\\theta', '45^\\circ', '\\pi r^2',
  '\\Delta m_1', '\\mathbf{B}^{-1}\\mathbf{v}', '\\dfrac{b}{2}',
  '\\frac{b}{\\sqrt{3}}', '\\left(\\frac{a}{b}\\right)', '\\vec{F}', '\\hat{x}',
  '\\overline{AB}', '\\alpha\\beta\\gamma', '\\int_0^1 x\\,dx', '\\sum_{i=1}^n i',
];

(async () => {
  const emPx = 24;
  let y = 10, maxW = 0;
  const parts = [];
  for (const tex of SPECIMENS) {
    const r = katexSvg.render(tex, { emPx, color: '#000000' });
    if (!r) { console.log('FAIL', tex); continue; }
    y += r.heightEm * emPx + 6;
    parts.push('<g transform="translate(10,' + y + ')">' + r.svg + '</g>');
    console.log('ok', JSON.stringify(tex), 'w=' + r.widthEm.toFixed(3) + 'em h=' + r.heightEm.toFixed(3) + ' d=' + r.depthEm.toFixed(3));
    y += r.depthEm * emPx + 6;
    maxW = Math.max(maxW, r.widthEm * emPx + 20);
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.ceil(maxW) + '" height="' + Math.ceil(y + 10) + '" viewBox="0 0 ' + Math.ceil(maxW) + ' ' + Math.ceil(y + 10) + '">' + parts.join('') + '</svg>';
  fs.writeFileSync('_lblprobe_out/ktest.svg', svg);
  const png = await blink.rasterizeSVG(svg, { scale: 2 });
  fs.writeFileSync('_lblprobe_out/ktest.png', png);
  await blink.closeBrowser();
  console.log('wrote _lblprobe_out/ktest.png');
})().catch(e => { console.error(e); process.exit(1); });
