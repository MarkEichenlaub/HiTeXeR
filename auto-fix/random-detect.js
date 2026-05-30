// auto-fix/random-detect.js
// Detects Asymptote sources that use the RNG. HiTeXeR does not replicate
// Asymptote's exact pseudo-random sequence, so any diagram that calls rand()
// / unitrand() / Gaussrand() / etc. will diverge from the TeXeR reference no
// matter how correct the interpreter is. Such diagrams have artificially low
// SSIM and must be (a) flagged in the comparator and (b) kept out of the canary.
//
// Usage as a module:  const { isRandomSource } = require('./random-detect');
// Usage as a CLI:      node auto-fix/random-detect.js   -> writes comparison/random-ids.json
'use strict';

const fs = require('fs');
const path = require('path');

// Strip // line comments, /* */ block comments and "..." string literals so we
// don't flag the word "rand" appearing in prose or a label string.
function stripCommentsAndStrings(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let inLine = false, inBlock = false, inStr = false;
  while (i < n) {
    const c = code[i], c2 = code[i + 1] || '';
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '/' && c2 === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }
    if (c === '"') { inStr = true; i++; continue; }
    out += c; i++;
  }
  return out;
}

const RNG_RE = /\b(unitrand|Gaussrandpair|Gaussrand|srand|randompath)\b|\brand\s*\(/;

function isRandomSource(code) {
  if (!code) return false;
  return RNG_RE.test(stripCommentsAndStrings(code));
}

module.exports = { isRandomSource };

// ── CLI ──────────────────────────────────────────────────────────
if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const ASY_SRC = path.join(ROOT, 'comparison', 'asy_src');
  const OUT = path.join(ROOT, 'comparison', 'random-ids.json');
  const files = fs.readdirSync(ASY_SRC).filter(f => f.endsWith('.asy'));
  const hits = [];
  for (const f of files) {
    let code = '';
    try { code = fs.readFileSync(path.join(ASY_SRC, f), 'utf8'); } catch { continue; }
    if (isRandomSource(code)) hits.push(f.slice(0, -4));
  }
  hits.sort();
  fs.writeFileSync(OUT, JSON.stringify(hits, null, 2) + '\n');
  console.log('scanned ' + files.length + ' sources; ' + hits.length + ' use the RNG');
  console.log('wrote ' + OUT);
}
