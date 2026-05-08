'use strict';
const fs = require('fs');
const path = require('path');
const epsCache = require('./eps-cache.js');
const dir = 'comparison/asy_src';
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.asy'));
const eps_re = /\/var\/www\/cdn\/[^\s"'\\)]+/g;
const results = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(dir,f),'utf8');
  const matches = [...new Set((raw.match(eps_re) || []))];
  if (matches.length) {
    results.push({id: f.replace('.asy',''), paths: matches});
  }
}
console.log('Total diagrams with /var/www/cdn refs:', results.length);
const idx = epsCache.loadIndex();
let ok=0, err=0, missing=0;
const missingDetails = [];
const errIDs = [];
const missingIDs = [];
for (const r of results) {
  let rOk = true, rMissing = false;
  for (const p of r.paths) {
    const e = idx[p];
    if (!e) { missing++; rMissing = true; rOk = false; missingDetails.push(r.id + ' :: ' + p); }
    else if (e.error) { err++; rOk = false; if (!errIDs.includes(r.id)) errIDs.push(r.id); }
    else ok++;
  }
  if (rMissing && !missingIDs.includes(r.id)) missingIDs.push(r.id);
}
console.log('Cache status: ok=' + ok + ' err=' + err + ' missing=' + missing);
if (missingDetails.length) {
  console.log('Missing entries:');
  for (const d of missingDetails.slice(0, 30)) console.log(' ', d);
}
console.log('Diagrams with errors in cache:', errIDs.length, errIDs.join(' '));
console.log('Diagrams with missing cache:', missingIDs.length);
console.log('All IDs:', results.map(r=>r.id).join(' '));
