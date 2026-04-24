// Render a target ID with both current and backup asy-interp, save both SVGs side-by-side.
'use strict';
const fs = require('fs');
const path = require('path');

const id = process.argv[2];
if (!id) { console.error('usage: node _compare_regression.js <ID>'); process.exit(1); }

const asyPath = path.join(__dirname, 'comparison', 'asy_src', id + '.asy');
const raw = fs.readFileSync(asyPath, 'utf8');
const code = '[asy]\n' + raw + '\n[/asy]';

function renderWith(interpFile, label) {
  // Fresh module cache
  for (const k of Object.keys(require.cache)) {
    if (k.includes('asy-interp')) delete require.cache[k];
  }
  // Reset global namespace
  delete global.window;
  global.window = {};
  global.katex = require('katex');
  require(interpFile);
  const A = global.window.AsyInterp;
  try {
    const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
    fs.writeFileSync(path.join(__dirname, `_cmp_${id}_${label}.svg`), r.svg);
    const iw = (r.svg.match(/data-intrinsic-w="([^"]+)"/) || [])[1];
    const ih = (r.svg.match(/data-intrinsic-h="([^"]+)"/) || [])[1];
    return { ok: true, w: iw, h: ih, len: r.svg.length };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

console.log(`Rendering ${id} ...`);
const cur = renderWith(path.join(__dirname, 'asy-interp.js'), 'cur');
const old = renderWith(path.join(__dirname, 'asy-interp.js.v098.bak'), 'old');
console.log('  current:', cur);
console.log('  backup :', old);
