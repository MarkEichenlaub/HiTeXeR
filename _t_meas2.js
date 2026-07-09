global.window = global; global.self = global;
require('./asy-interp.js');
const ks = global.katexSvg;
for (const s of ['66 \\frac{2}{3} \\%', '50\\%', '60\\%', '62 \\frac{1}{2} \\%']) {
  let m = null;
  try { m = ks.measure(s); } catch (e) {}
  let r = null;
  try { r = ks.render(s, 12, '#000'); } catch (e) {}
  // render returns svg string? measure emitted glyph span from render output
  let span = null;
  if (r && typeof r === 'object' && r.svg) r = r.svg;
  if (typeof r === 'string') {
    const xs = [...r.matchAll(/translate\(([-\d.]+)[, ]/g)].map(x => +x[1]);
    if (xs.length) span = (Math.max(...xs) - Math.min(...xs)).toFixed(2);
  }
  console.log(JSON.stringify(s), 'measure:', m ? (m.widthEm * 12).toFixed(2) + 'bp' : 'null', 'renderType:', typeof r);
}
