'use strict';
// Repopulate comparison/asy_src/ from asy_corpus/ as numbered copies.
// Mirrors the "save .asy source files" step in ssim-pipeline.js (lines 195-200)
// without re-running the rest of the pipeline.

const fs   = require('fs');
const path = require('path');
// Strip the historical \t-corruption when copying corpus -> render source so a
// corrupted asy_corpus file can never re-corrupt asy_src. See clean-code-tabs.js.
const { cleanCodeTabs } = require('./comparison/clean-code-tabs');

const ROOT       = __dirname;
const CORPUS_DIR = path.join(ROOT, 'asy_corpus');
const ASY_SRC    = path.join(ROOT, 'comparison', 'asy_src');

if (!fs.existsSync(CORPUS_DIR)) {
  console.error('asy_corpus/ not found at ' + CORPUS_DIR);
  process.exit(1);
}
if (!fs.existsSync(ASY_SRC)) fs.mkdirSync(ASY_SRC, { recursive: true });

const allFiles = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy')).sort();
console.log('Corpus: ' + allFiles.length + ' .asy files');

const numId = i => String(i + 1).padStart(5, '0');

let written = 0, skipped = 0;
for (let i = 0; i < allFiles.length; i++) {
  const src = cleanCodeTabs(fs.readFileSync(path.join(CORPUS_DIR, allFiles[i]), 'utf8'));
  const out = path.join(ASY_SRC, numId(i) + '.asy');
  // Only write if missing or changed (cheap mtime guard for re-runs).
  let needWrite = true;
  if (fs.existsSync(out)) {
    const cur = fs.readFileSync(out, 'utf8');
    if (cur === src) { needWrite = false; skipped++; }
  }
  if (needWrite) {
    fs.writeFileSync(out, src);
    written++;
  }
  if ((i + 1) % 1000 === 0) {
    console.log('  ' + (i + 1) + '/' + allFiles.length + '  written=' + written + ' skipped=' + skipped);
  }
}

console.log('Done. wrote=' + written + ' skipped=' + skipped + ' total=' + allFiles.length);
