#!/usr/bin/env node
/*
 * Repair scraper tab/newline corruption in .asy sources.
 *
 * Root cause: the AoPS-redshift scraper unescaped DB text with
 *   text.replace('\\n','\n').replace('\\t','\t')...
 * which turned LaTeX commands beginning "\t" / "\n" into a raw TAB / NEWLINE
 * INSIDE label strings. e.g. inside "$...$":
 *   "\theta"  -> "<TAB>heta"     "\textbf" -> "<TAB>extbf"
 *   "\tiny"   -> "<TAB>iny"      "\nu"     -> "<NL>u"        "\ne" -> "<NL>e"
 * TeXeR renders the raw source, so it prints "heta" / splits the label.
 *
 * Reversal (string-aware, so legitimate indentation tabs, trailing tabs, tabs in
 * comments, and real line breaks are all left alone):
 *   - a TAB inside a string literal      -> the two chars  backslash + 't'
 *   - a run of CR/LF inside a string lit  -> the two chars  backslash + 'n'
 * That regenerates \theta, \tiny, \textbf, \triangle, \times, \tan, \nu, \ne, ...
 * generically, no per-command map needed.
 *
 * Usage:
 *   node comparison/repair-tab-corruption.js --dry-run   (report + sample diffs, no writes)
 *   node comparison/repair-tab-corruption.js --apply      (repair asy_src + asy_corpus; write changed-id list)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['comparison/asy_src', 'asy_corpus'];

const args = process.argv.slice(2);
const DRY = !args.includes('--apply');

function repair(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inString = false, inLine = false, inBlock = false;
  let nTab = 0, nNl = 0;
  while (i < n) {
    const c = text[i], c2 = text[i + 1];
    if (inLine) { out += c; if (c === '\n') inLine = false; i++; continue; }
    if (inBlock) { out += c; if (c === '*' && c2 === '/') { out += c2; i += 2; inBlock = false; continue; } i++; continue; }
    if (inString) {
      if (c === '\\') { out += c; if (i + 1 < n) { out += text[i + 1]; i += 2; } else i++; continue; }
      if (c === '"') { inString = false; out += c; i++; continue; }
      if (c === '\t') { out += '\\t'; nTab++; i++; continue; }
      if (c === '\r' || c === '\n') { while (i < n && (text[i] === '\r' || text[i] === '\n')) i++; out += '\\n'; nNl++; continue; }
      out += c; i++; continue;
    }
    if (c === '/' && c2 === '/') { inLine = true; out += c; i++; continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += c; i++; continue; }
    if (c === '"') { inString = true; out += c; i++; continue; }
    out += c; i++; continue;
  }
  return { out, nTab, nNl };
}

let totalFiles = 0, totalTab = 0, totalNl = 0;
const changedIds = [];
const samples = [];

for (const rel of DIRS) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.asy')) continue;
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, 'utf8');
    if (text.indexOf('\t') === -1 && text.indexOf('\n') === -1) continue;
    const { out, nTab, nNl } = repair(text);
    if (out === text) continue;
    totalFiles++; totalTab += nTab; totalNl += nNl;
    if (rel === 'comparison/asy_src') changedIds.push(f.replace(/\.asy$/, ''));
    if (samples.length < 10) {
      let k = 0; while (k < text.length && text[k] === out[k]) k++;
      samples.push({ file: rel + '/' + f,
        before: JSON.stringify(text.slice(Math.max(0, k - 25), k + 15)),
        after: JSON.stringify(out.slice(Math.max(0, k - 25), k + 17)) });
    }
    if (!DRY) fs.writeFileSync(p, out);
  }
}

console.log(DRY ? '== DRY RUN (no files written) ==' : '== APPLIED ==');
console.log('files repaired:', totalFiles, ' in-string tabs:', totalTab, ' in-string newlines:', totalNl);
console.log('\nsample repairs (context around first change):');
for (const s of samples) {
  console.log('  ' + s.file);
  console.log('    -  ' + s.before);
  console.log('    +  ' + s.after);
}
if (!DRY) {
  const uniq = [...new Set(changedIds)].sort();
  fs.writeFileSync(path.join(ROOT, 'comparison', 'tab-repaired-ids.json'), JSON.stringify(uniq));
  console.log('\nwrote ' + uniq.length + ' repaired asy_src ids -> comparison/tab-repaired-ids.json');
}
