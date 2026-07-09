global.window = global; global.self = global;
require('./asy-interp.js');
const ks = global.katexSvg;
const real = {
  'a': [9.136, 8.138],
  'ab': [14.113, 11.293],
  '\\frac{r}{R} = \\frac14': [34.181, 16.957],
};
for (const [s, r] of Object.entries(real)) {
  let m = null;
  try { m = ks.measure(s); } catch (e) {}
  if (!m) { console.log(JSON.stringify(s), 'measure failed'); continue; }
  const w = m.widthEm * 12, h = (m.heightEm + m.depthEm) * 12;
  console.log(JSON.stringify(s).slice(0, 28).padEnd(28),
    'katex', w.toFixed(2) + 'x' + h.toFixed(2),
    'real', r[0].toFixed(2) + 'x' + r[1].toFixed(2),
    'dW=' + (r[0] - w).toFixed(2), 'dH=' + (r[1] - h).toFixed(2));
}
