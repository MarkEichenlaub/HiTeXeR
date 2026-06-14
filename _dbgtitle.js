const fs = require('fs');
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;

const src = fs.readFileSync('comparison/asy_src/03385.asy', 'utf8');
const variants = {
  ORIG: src,
  TITLE_REMOVED: src.replace(/label\(title,[^\n]*\n/, '// removed\n'),
};
for (const [name, code] of Object.entries(variants)) {
  process.stderr.write('=== ' + name + ' ===\n');
  try {
    const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
    const vb = r.svg.match(/viewBox="([^"]+)"/)[1];
    // box from grey gridlines
    const re = /<path d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)" fill="none" stroke="#808080"/g;
    let m, top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity;
    while ((m = re.exec(r.svg))) {
      top = Math.min(top, +m[2], +m[4]); bot = Math.max(bot, +m[2], +m[4]);
      left = Math.min(left, +m[1], +m[3]); right = Math.max(right, +m[1], +m[3]);
    }
    process.stderr.write(name + ' viewBox=' + vb + ' boxLRTB=' + [left, right, top, bot].map(x => x.toFixed(1)).join(',')
      + ' boxW=' + (right - left).toFixed(1) + ' boxH=' + (bot - top).toFixed(1) + '\n');
  } catch (e) { process.stderr.write(name + ' ERR ' + String(e.message || e).slice(0, 150) + '\n'); }
}
