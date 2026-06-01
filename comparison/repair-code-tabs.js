#!/usr/bin/env node
/*
 * Repair scraper CODE-LEVEL \t / \n corruption in .asy sources.
 *
 * The INVERSE problem of repair-tab-corruption.js. An early scraper era wrote
 * the raw DB text verbatim, so a genuine indentation TAB / line break that the
 * DB had stored escaped (the two chars '\' + 't' / 'n') landed in the corpus
 * as a literal backslash-t / backslash-n in CODE — e.g.
 *     }\n  else{\n\t\txarrow = EndArrow;
 * TeXeR renders the raw source and chokes on the stray backslash sequences.
 *
 * Fix (string- AND comment-aware, identical state machine to the current
 * fetch-asy-diagrams.py unescape_asy, so the result == a fresh re-scrape for any
 * diagram whose DB source is unchanged):
 *   OUTSIDE string literals and comments:  '\' 't'  -> TAB ,  '\' 'n' -> NEWLINE
 *   INSIDE strings / comments:             left untouched (so \theta, \nu,
 *                                          \textbf, commented-out labels survive)
 *
 * Usage:
 *   node comparison/repair-code-tabs.js --dry-run            report only
 *   node comparison/repair-code-tabs.js --apply              repair asy_src (+ .prebak), write id list
 *   node comparison/repair-code-tabs.js --apply --ids a,b    restrict to given ids
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASY_SRC = path.join(ROOT, 'comparison', 'asy_src');
const OUTLIST = path.join(ROOT, 'comparison', 'tab-repaired-ids.json');

const args = process.argv.slice(2);
const DRY = !args.includes('--apply');
let onlyIds = null;
{
  const k = args.indexOf('--ids');
  if (k !== -1 && args[k + 1]) onlyIds = new Set(args[k + 1].split(/[\s,]+/).filter(Boolean).map(s => s.padStart(5, '0')));
}

function repair(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let sd = null;            // string delimiter (null outside strings)
  let inLine = false, inBlock = false;
  let nTab = 0, nNl = 0;
  while (i < n) {
    const c = code[i], c2 = i + 1 < n ? code[i + 1] : '';
    if (sd !== null) {
      if (c === '\\') { out += c; if (i + 1 < n) { out += code[i + 1]; i += 2; } else i++; continue; }
      if (c === sd) sd = null;
      out += c; i++; continue;
    }
    // structural newline expands everywhere outside strings (incl. comments):
    // a literal \n is what terminates a // line comment.
    if (c === '\\' && c2 === 'n') { out += '\n'; nNl++; i += 2; inLine = false; continue; }
    if (c === '\\' && c2 === 'r') { out += '\r'; i += 2; continue; }
    if (c === '\n') { out += c; i++; inLine = false; continue; }
    if (inLine) { out += c; i++; continue; }
    if (inBlock) { if (c === '*' && c2 === '/') { out += '*/'; i += 2; inBlock = false; continue; } out += c; i++; continue; }
    if (c === '\\' && c2 === 't') { out += '\t'; nTab++; i += 2; continue; }
    if (c === '\\' && c2 === '\\') { out += '\\'; i += 2; continue; }
    if (c === '/' && c2 === '/') { inLine = true; out += c; i++; continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += c; i++; continue; }
    if (c === '"' || c === "'") { sd = c; out += c; i++; continue; }
    out += c; i++;
  }
  return { out, nTab, nNl };
}

let files = 0, totTab = 0, totNl = 0;
const changed = [];
const samples = [];
for (const f of fs.readdirSync(ASY_SRC)) {
  if (!f.endsWith('.asy')) continue;
  const id = f.slice(0, -4);
  if (onlyIds && !onlyIds.has(id)) continue;
  const p = path.join(ASY_SRC, f);
  const text = fs.readFileSync(p, 'utf8');
  if (text.indexOf('\\t') === -1 && text.indexOf('\\n') === -1) continue;
  const { out, nTab, nNl } = repair(text);
  if (out === text) continue;
  files++; totTab += nTab; totNl += nNl; changed.push(id);
  if (samples.length < 8) {
    let k = 0; while (k < text.length && text[k] === out[k]) k++;
    samples.push({ id, before: JSON.stringify(text.slice(Math.max(0, k - 20), k + 12)), after: JSON.stringify(out.slice(Math.max(0, k - 20), k + 12)) });
  }
  if (!DRY) {
    if (!fs.existsSync(p + '.prebak')) fs.copyFileSync(p, p + '.prebak');
    fs.writeFileSync(p, out);
  }
}

console.log(DRY ? '== DRY RUN (no writes) ==' : '== APPLIED ==');
console.log(`files: ${files}  code-tabs fixed: ${totTab}  code-newlines fixed: ${totNl}`);
for (const s of samples) { console.log('  ' + s.id); console.log('    - ' + s.before); console.log('    + ' + s.after); }
if (!DRY) {
  const prev = (() => { try { return JSON.parse(fs.readFileSync(OUTLIST, 'utf8')); } catch { return []; } })();
  const uniq = [...new Set([...prev.map(String), ...changed])].sort();
  fs.writeFileSync(OUTLIST, JSON.stringify(uniq));
  // Also write THIS run's changed ids so the downstream pipeline can target exactly
  // the diagrams whose source we just touched (OUTLIST accumulates across runs).
  const RUNLIST = path.join(ROOT, 'comparison', 'codetab-repaired-ids.txt');
  fs.writeFileSync(RUNLIST, [...changed].sort().join(','));
  console.log(`\nmerged ${changed.length} repaired ids into ${path.relative(ROOT, OUTLIST)} (now ${uniq.length})`);
  console.log(`this-run changed ids -> ${path.relative(ROOT, RUNLIST)} (${changed.length})`);
}
