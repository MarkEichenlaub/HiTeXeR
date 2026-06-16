const { execFileSync } = require('child_process');
const fs = require('fs');
const ASY = 'C:/Program Files/Asymptote/asy.exe';
const TMP = 'C:/Users/Public/htx_oracle/_p.asy';
global.window = {}; try { global.katex = require('katex'); } catch (e) {}
require('./asy-interp.js');
const A = window.AsyInterp;
function asyC(expr) {
  fs.writeFileSync(TMP, 'path _t=' + expr + '; write(_t);\n');
  const out = execFileSync(ASY, ['-noV', TMP], { encoding: 'utf8' });
  return [...out.matchAll(/\(([-\d.eE]+),\s*([-\d.eE]+)\)/g)].map(m => [+m[1], +m[2]]);
}
function htxC(expr) {
  const r = A.render('[asy]\nunitsize(1);\ndraw(' + expr + ');\n[/asy]', { containerW: 1500, containerH: 1200, labelOutput: 'svg-native' });
  const d = [...r.svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const toks = d.match(/[MLCZmlcz]|-?[\d.]+(?:e-?\d+)?/g); const pairs = []; let i = 0;
  while (i < toks.length) { if (/[A-Za-z]/.test(toks[i])) { i++; continue; } const x = +toks[i], y = +toks[i + 1]; i += 2; pairs.push([x / r.pxPerUnitX + r.minX, r.maxY - y / r.pxPerUnitY]); }
  return pairs;
}
for (const expr of ['brace((0,0),(0,10))', 'brace((0,0),(8,0))']) {
  const a = asyC(expr), h = htxC(expr);
  let maxd = 0, worst = -1; const n = Math.min(a.length, h.length);
  for (let k = 0; k < n; k++) { const dd = Math.hypot(a[k][0] - h[k][0], a[k][1] - h[k][1]); if (dd > maxd) { maxd = dd; worst = k; } }
  console.log(expr.padEnd(22), 'asyPts=' + a.length, 'htxPts=' + h.length, 'maxDiff=' + maxd.toFixed(3) + (worst >= 0 ? ' @' + worst : ''));
  if (maxd > 0.2) { console.log('  asy:', a.slice(0, 6).map(p => '(' + p[0].toFixed(2) + ',' + p[1].toFixed(2) + ')').join(' ')); console.log('  htx:', h.slice(0, 6).map(p => '(' + p[0].toFixed(2) + ',' + p[1].toFixed(2) + ')').join(' ')); }
}
