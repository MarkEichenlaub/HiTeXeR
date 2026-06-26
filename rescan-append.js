'use strict';
// Content-dedup the staging re-scan (asy_corpus_rescan/) against the live corpus
// (asy_corpus/) and APPEND only genuinely-new diagrams. Existing ids / texer_pngs
// are never touched: new files get brand-new ids at the end via corpus-ids.json.
//
//   node rescan-append.js          # dry-run: report new/changed/unchanged counts
//   node rescan-append.js --apply  # copy genuinely-new diagrams into asy_corpus/
//
// "New" = normalized content (all whitespace stripped) not already present in the
// corpus. A changed diagram (same problem, edited asy) therefore appends as a NEW
// diagram and the old one is kept — exactly as requested.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CORPUS = path.join(ROOT, 'asy_corpus');
const STAGING = path.join(ROOT, 'asy_corpus_rescan');
const APPLY = process.argv.includes('--apply');

const norm = s => s.replace(/\s+/g, '');             // whitespace-insensitive identity
const hash6 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36).padStart(6, '0').slice(0, 6); };

// Index existing corpus content.
const corpusFiles = fs.readdirSync(CORPUS).filter(f => f.endsWith('.asy'));
const corpusNorm = new Set();
const corpusNames = new Set(corpusFiles);
for (const f of corpusFiles) {
  try { corpusNorm.add(norm(fs.readFileSync(path.join(CORPUS, f), 'utf8'))); } catch {}
}

const stagingFiles = fs.readdirSync(STAGING).filter(f => f.endsWith('.asy'));
const seenThisRun = new Set();   // dedup within staging
const toAppend = [];             // { name, content }
let unchanged = 0, dupWithinRescan = 0, empty = 0;

for (const f of stagingFiles) {
  let content;
  try { content = fs.readFileSync(path.join(STAGING, f), 'utf8'); } catch { continue; }
  if (!content.trim()) { empty++; continue; }
  const key = norm(content);
  if (!key) { empty++; continue; }
  if (corpusNorm.has(key)) { unchanged++; continue; }
  if (seenThisRun.has(key)) { dupWithinRescan++; continue; }
  seenThisRun.add(key);
  // Choose a non-colliding corpus filename (preserve cN_ prefix for categorization).
  let name = f;
  if (corpusNames.has(name)) name = f.replace(/\.asy$/, '') + '__r' + hash6(key) + '.asy';
  while (corpusNames.has(name)) name = name.replace(/\.asy$/, '') + 'x.asy';
  corpusNames.add(name);
  toAppend.push({ name, content });
}

// Per-collection breakdown of the genuinely-new diagrams.
const byColl = {};
for (const a of toAppend) { const m = /^(c\d+)_/.exec(a.name); const c = m ? m[1] : 'other'; byColl[c] = (byColl[c] || 0) + 1; }

console.log(`Staging files:      ${stagingFiles.length}`);
console.log(`  unchanged:        ${unchanged}`);
console.log(`  dup within rescan:${dupWithinRescan}`);
console.log(`  empty:            ${empty}`);
console.log(`  NEW to append:    ${toAppend.length}`);
console.log('New-by-collection:', JSON.stringify(byColl, (k, v) => v, 2));

if (APPLY && toAppend.length) {
  for (const a of toAppend) fs.writeFileSync(path.join(CORPUS, a.name), a.content);
  console.log(`\nAppended ${toAppend.length} new .asy files to asy_corpus/.`);
  console.log('Next: node comparison/generate-manifest.js  (assigns new ids), then asy_src + texer fetch + recompute.');
} else if (!APPLY) {
  console.log('\n(dry-run — re-run with --apply to copy these into asy_corpus/)');
}
