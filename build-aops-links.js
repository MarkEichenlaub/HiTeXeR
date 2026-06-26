'use strict';
// Build comparison/aops-links.json: { "<diagramId>": "<AoPS crypt URL>" }.
// Source of truth: comparison/corpus-ids.json (filename->id by position) +
// the (collection,lesson)->script_document_id map that rescan-staging.py wrote
// to asy_corpus_rescan/_scriptdocs.json.
//
//   script diagram  c{cid}_L{lesson}_script_{i}   -> /crypt/document/{cid}/{docId}
//   homework diagram c{cid}_L{lesson}_p{pid}_..._{i} -> /crypt/document/{cid}/{docId}
// (homework currently links to its lesson's script/lecture document — the correct
//  lesson on AoPS; can be upgraded to /crypt/collection/{cid}/homework/{n} once the
//  public homework numbering is confirmed.)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CMP = path.join(ROOT, 'comparison');
const order = JSON.parse(fs.readFileSync(path.join(CMP, 'corpus-ids.json'), 'utf8'));
const scriptDocs = JSON.parse(fs.readFileSync(path.join(ROOT, 'asy_corpus_rescan', '_scriptdocs.json'), 'utf8'));
const BASE = 'https://artofproblemsolving.com/crypt';

const numId = i => String(i + 1).padStart(5, '0');
const links = {};
let n = 0;
for (let i = 0; i < order.length; i++) {
  const fn = order[i];
  const m = /^c(\d+)_L(\d+)_/.exec(fn);     // numeric collection + numeric lesson
  if (!m) continue;
  const cid = m[1], lesson = m[2];
  const docId = scriptDocs[`${cid}_${lesson}`];
  if (docId == null) continue;
  links[numId(i)] = `${BASE}/document/${cid}/${docId}`;
  n++;
}
fs.writeFileSync(path.join(CMP, 'aops-links.json'), JSON.stringify(links));
console.log(`Wrote comparison/aops-links.json: ${n}/${order.length} diagrams linked`);
