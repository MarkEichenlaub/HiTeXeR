// Dims-focused comparator: ref vs current htx_pngs vs pre-change survey ratios,
// with oracle bp where available.
// usage: node _cmp_dims.js _probe_ids.txt [_oracle_probe.txt]
const fs = require('fs');
function dims(f) { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
const ids = fs.readFileSync(process.argv[2], 'utf8').split(/\s+/).filter(Boolean);
let survey = new Map();
try { survey = new Map(require('./_size_survey.json').map(r => [r.id, r])); } catch (e) {}
const oracle = new Map();
if (process.argv[3]) {
  for (const line of fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(\d+) oracle=(\d+)x(\d+)bp/);
    if (m) oracle.set(m[1], [+m[2], +m[3]]);
  }
}
let okN = 0, badN = 0, fixedN = 0, brokeN = 0;
const lines = [];
for (const id of ids) {
  let r, h;
  try { r = dims('comparison/texer_pngs/' + id + '.png'); h = dims('comparison/htx_pngs/' + id + '.png'); }
  catch (e) { lines.push(id + ' missing'); continue; }
  const wR = h[0] / r[0], hR = h[1] / r[1];
  const bad = Math.abs(wR - 1) > 0.07 || Math.abs(hR - 1) > 0.07;
  const s = survey.get(id);
  const wasBad = s ? (Math.abs(s.wR - 1) > 0.07 || Math.abs(s.hR - 1) > 0.07) : null;
  if (bad) badN++; else okN++;
  if (wasBad === true && !bad) fixedN++;
  if (wasBad === false && bad) brokeN++;
  const o = oracle.get(id);
  const oNote = o ? ` oracle=${o[0]}x${o[1]}bp(htx ${(h[0] * 0.3 / o[0]).toFixed(2)}/${(h[1] * 0.3 / o[1]).toFixed(2)})` : '';
  const flag = bad ? (wasBad === false ? ' <<< NEW-BAD' : ' <<< bad') : (wasBad ? ' (FIXED)' : '');
  lines.push(`${id} ref=${r.join('x')} htx=${h.join('x')} wR=${wR.toFixed(2)} hR=${hR.toFixed(2)} (was ${s ? s.wR.toFixed(2) + '/' + s.hR.toFixed(2) : '-'})${oNote}${flag}`);
}
for (const l of lines) console.log(l);
console.log(`\nOK(±7%): ${okN}  bad: ${badN}  newly-fixed: ${fixedN}  newly-broken: ${brokeN}`);
