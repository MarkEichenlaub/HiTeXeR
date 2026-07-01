// Render corpus ids through local asy with the TeXeR wrapper, then rasterize
// the EPS at 240dpi (TeXeR refs are 10/3 px/bp) for pixel-level comparison.
// usage: node _oracle_render.js 12995 00383 ...
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const TMP = 'C:\\Users\\Public\\htx_oracle';
fs.mkdirSync(TMP, { recursive: true });
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
const GS = 'C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe';
for (const id of process.argv.slice(2)) {
  let code = fs.readFileSync('comparison/asy_src/' + id + '.asy', 'utf8');
  code = code.replace(/^(?:\\t)+/gm, m => '\t'.repeat(m.length / 2));
  const hasImportGraph = /import\s+(graph|olympiad)\s*;/.test(code);
  const match = /size\w*\s*[(=]\s*[\d.]/.test(code);
  const wrapped = (hasImportGraph ? '' : 'import graph;\n') + 'size(400,400);\n' + code + (match ? '' : '\nsize(150,150);') + '\n';
  const asyFile = path.join(TMP, 'o' + id + '.asy');
  fs.writeFileSync(asyFile, wrapped);
  try {
    execFileSync(ASY, ['-f', 'eps', '-o', 'o' + id, 'o' + id + '.asy'], { cwd: TMP, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync(GS, ['-dBATCH', '-dNOPAUSE', '-dEPSCrop', '-r240', '-sDEVICE=png16m', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-o', path.join(TMP, 'o' + id + '.png'), path.join(TMP, 'o' + id + '.eps')], { timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    const b = fs.readFileSync(path.join(TMP, 'o' + id + '.png'));
    console.log(id, 'oracle png', b.readUInt32BE(16) + 'x' + b.readUInt32BE(20));
  } catch (e) { console.log(id, 'FAIL', String(e.stderr || e.message).slice(0, 400)); }
}
