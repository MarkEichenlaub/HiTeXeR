global.window = global; global.self = global;
require('./asy-interp.js');
const A = global.AsyInterp;
// _katexMeasureBp and _mjxMeasureBp are internal; probe via a tiny render that
// exposes them? Instead re-require and use the debug hook if exported.
// Fallback: render the raw strings through AsyInterp.render of a one-label file
// and read the data-ext vs canvas edge. Simpler: use the exposed globals if any.
console.log('exports:', Object.keys(A).join(' '));
if (A._debugMeasure) {
  for (const s of ['$66 \\frac{2}{3} \\%$', '$50\\%$']) {
    console.log(JSON.stringify(s), JSON.stringify(A._debugMeasure(s, 12)));
  }
}
