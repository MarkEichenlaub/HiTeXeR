// Compare pre-fix baseline (_graph_baseline.jsonl) vs post-fix render
// (_graph_postfix.jsonl). Flags regressions in `combined` score.
'use strict';
const fs = require('fs');
function load(p) {
  const m = new Map();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    let o; try { o = JSON.parse(s); } catch (e) { continue; }
    if (o.summary) continue;
    if (!o.id) continue;
    m.set(o.id, o);
  }
  return m;
}
const pre = load('_graph_baseline.jsonl');
const post = load('_graph_postfix.jsonl');
const TH = 0.03;
const regr = [], impr = [], newErr = [], fixedErr = [];
let common = 0;
for (const [id, po] of post) {
  const pr = pre.get(id);
  if (!pr) continue;
  common++;
  const preErr = pr.err !== undefined, postErr = po.err !== undefined;
  if (postErr && !preErr) { newErr.push({ id, err: po.err }); continue; }
  if (preErr && !postErr) { fixedErr.push({ id }); continue; }
  if (preErr && postErr) continue;
  const d = (po.combined ?? 0) - (pr.combined ?? 0);
  if (d < -TH) regr.push({ id, pre: pr.combined, post: po.combined, d });
  else if (d > TH) impr.push({ id, pre: pr.combined, post: po.combined, d });
}
regr.sort((a, b) => a.d - b.d);
impr.sort((a, b) => a.d - b.d);
console.log(`common IDs: ${common}  (pre=${pre.size}, post=${post.size})`);
console.log(`\n=== NEW ERRORS (${newErr.length}) ===`);
for (const e of newErr) console.log(`  ${e.id}: ${e.err}`);
console.log(`\n=== REGRESSIONS combined < -${TH} (${regr.length}) ===`);
for (const r of regr) console.log(`  ${r.id}: ${r.pre?.toFixed(4)} -> ${r.post?.toFixed(4)}  (${r.d.toFixed(4)})`);
console.log(`\n=== IMPROVEMENTS combined > +${TH} (${impr.length}) ===`);
for (const r of impr.slice(0, 40)) console.log(`  ${r.id}: ${r.pre?.toFixed(4)} -> ${r.post?.toFixed(4)}  (+${r.d.toFixed(4)})`);
if (impr.length > 40) console.log(`  ... and ${impr.length - 40} more`);
console.log(`\n=== FIXED ERRORS (${fixedErr.length}) ===`);
for (const e of fixedErr) console.log(`  ${e.id}`);
console.log(`\nSUMMARY: ${regr.length} regressions, ${newErr.length} new errors, ${impr.length} improvements, ${fixedErr.length} fixed errors`);
