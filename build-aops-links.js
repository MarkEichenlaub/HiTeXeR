'use strict';
// Build comparison/aops-links.json: { "<diagramId>": "<AoPS crypt URL>" }.
// Source of truth: comparison/corpus-ids.json (filename->id by position) +
// the (collection,lesson)->script_document_id map that rescan-staging.py wrote
// to asy_corpus_rescan/_scriptdocs.json.
//
//   script diagram   c{cid}_L{lesson}_script_{i}      -> /crypt/document/{cid}/{scriptDocId}
//   homework diagram c{cid}_L{lesson}_p{pid}_..._{i}  -> /crypt/collection/{cid}/homework/{lesson}
//
// The homework number == the lesson number: verified on the live c405 homework
// list, where each /homework/N row's total-problem count exactly matches DB
// lesson N's problem count for all 24 lessons (incl. the distinctive 23-problem
// L12), and homework/21 contains lesson-21's problems. Uniform AoPS convention.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CMP = path.join(ROOT, 'comparison');
const order = JSON.parse(fs.readFileSync(path.join(CMP, 'corpus-ids.json'), 'utf8'));
let scriptDocs = {};
try { scriptDocs = JSON.parse(fs.readFileSync(path.join(ROOT, 'asy_corpus_rescan', '_scriptdocs.json'), 'utf8')); } catch {}
const BASE = 'https://artofproblemsolving.com/crypt';

const numId = i => String(i + 1).padStart(5, '0');
const links = {};
let nScript = 0, nHw = 0;
for (let i = 0; i < order.length; i++) {
  const fn = order[i];
  let m = /^c(\d+)_L(\d+)_script_/.exec(fn);          // lecture/script diagram
  if (m) {
    const docId = scriptDocs[`${m[1]}_${m[2]}`];
    if (docId != null) { links[numId(i)] = `${BASE}/document/${m[1]}/${docId}`; nScript++; }
    continue;
  }
  m = /^c(\d+)_L(\d+)_p\d+_/.exec(fn);                 // homework-problem diagram
  if (m) { links[numId(i)] = `${BASE}/collection/${m[1]}/homework/${m[2]}`; nHw++; continue; }
}
fs.writeFileSync(path.join(CMP, 'aops-links.json'), JSON.stringify(links));
console.log(`Wrote comparison/aops-links.json: ${nScript} script(document) + ${nHw} homework = ${nScript + nHw}/${order.length}`);
