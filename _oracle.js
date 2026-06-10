// Local-asy TeXeR oracle: render corpus IDs through local Asymptote with the
// discovered TeXeR wrapper, and compare the EPS bbox (bp) to the stored
// texer_pngs reference dims (px*3/10 = bp).
//
// usage: node _oracle.js 03724 11003 ...     (or --file ids.txt)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'comparison', 'asy_src');
const REF = path.join(ROOT, 'comparison', 'texer_pngs');
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
// no-spaces path: dvips chokes on "Mark Eichenlaub"
const TMP = 'C:\\Users\\Public\\htx_oracle';
fs.mkdirSync(TMP, { recursive: true });

function pngDims(f) {
  const b = fs.readFileSync(f);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

let ids = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') ids = ids.concat(fs.readFileSync(argv[++i], 'utf8').split(/\s+/).filter(Boolean));
  else ids.push(argv[i]);
}

for (const id of ids) {
  const srcFile = path.join(SRC, id + '.asy');
  let code;
  try { code = fs.readFileSync(srcFile, 'utf8'); } catch (e) { console.log(id, 'NO-SRC'); continue; }
  // repair the scraper's literal "\t" line-indentation corruption
  code = code.replace(/^(?:\\t)+/gm, m => '\t'.repeat(m.length / 2));
  // TeXeR wrapper: prepend size(400,400); append size(150,150) iff no size-
  // text match in the USER code (the server regex scans only the [asy]
  // snippet). Imports: try `import graph` first (TeXeR provides graph
  // functions without import); fall back to `import olympiad` (which
  // includes graph itself — do NOT combine, the double graph include makes
  // xaxis overloads ambiguous), then olympiad+cse5.
  const match = /size\w*\s*[(=]\s*[\d.]/.test(code);
  const epsFile = path.join(TMP, id + '.eps');
  const asyFile = path.join(TMP, id + '.asy');
  let err = '';
  const variants = ['import graph;\n', 'import olympiad;\n', 'import olympiad;\nimport cse5;\n'];
  for (const pre of variants) {
    const wrapped = pre + 'size(400,400);\n' + code + (match ? '' : '\nsize(150,150);') + '\n';
    fs.writeFileSync(asyFile, wrapped);
    try { fs.unlinkSync(epsFile); } catch (e) {}
    try {
      execFileSync(ASY, ['-f', 'eps', '-noV', '-o', id, asyFile], { timeout: 90000, cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
      err = '';
      if (fs.existsSync(epsFile)) break;
    } catch (e) { err = String((e.stderr || '') + (e.stdout || '') || e.message).slice(0, 150).replace(/\r?\n/g, ' '); }
  }
  let bbox = null;
  if (fs.existsSync(epsFile)) {
    const eps = fs.readFileSync(epsFile, 'latin1');
    const m = eps.match(/%%HiResBoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/) ||
              eps.match(/%%BoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/);
    if (m) bbox = [(+m[3]) - (+m[1]), (+m[4]) - (+m[2])];
  }
  let refBp = null;
  try { const d = pngDims(path.join(REF, id + '.png')); refBp = [d[0] * 0.3, d[1] * 0.3]; } catch (e) {}
  if (bbox && refBp) {
    const wR = bbox[0] / refBp[0], hR = bbox[1] / refBp[1];
    const flag = (Math.abs(wR - 1) > 0.07 || Math.abs(hR - 1) > 0.07) ? '  DIVERGES' : '';
    console.log(`${id} oracle=${bbox[0].toFixed(0)}x${bbox[1].toFixed(0)}bp ref=${refBp[0].toFixed(0)}x${refBp[1].toFixed(0)}bp wR=${wR.toFixed(3)} hR=${hR.toFixed(3)} match=${match ? 400 : 150}${flag}`);
  } else {
    console.log(`${id} ${bbox ? 'oracle=' + bbox.map(x => x.toFixed(0)).join('x') + 'bp' : 'ASY-FAIL'} ${refBp ? 'ref=' + refBp.map(x => x.toFixed(0)).join('x') + 'bp' : 'NO-REF'} ${err}`);
  }
}
