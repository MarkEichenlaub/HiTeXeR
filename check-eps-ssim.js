'use strict';
const fs = require('fs');
const path = require('path');
const epsIDs = ['04296','04888','04889','04890','08900','08901','08902','08903','08904','08905','08906','08907','08908','08909','08912','08913','08916','08917','08918','08919','08920','08921','08922','08923','08924','08925','08926','08927','08928','08929','08930','08931','08932','08933','08934','08935','08936','08937','08938','08939','08940','08941','08943','08944','08945','08947','08948','08949','08950','08951','08952','08953','08954','08955','08956','08957','08958','09017','09018','09019','09020','09043'];

const ssim = JSON.parse(fs.readFileSync('comparison/ssim-results.json','utf8'));
const map = {};
for (const r of ssim) map[r.id] = r;

let good=0, fair=0, poor=0, bad=0, missing=0;
const rows = [];
for (const id of epsIDs) {
  const r = map[id];
  if (!r) { missing++; rows.push({id, status:'no-ssim'}); continue; }
  const s = r.combined != null ? r.combined : r.ssim;
  let label;
  if (s < 0) { label='Err'; bad++; }
  else if (s >= 0.95) { label='Good'; good++; }
  else if (s >= 0.85) { label='Fair'; fair++; }
  else if (s >= 0.70) { label='Poor'; poor++; }
  else { label='Bad'; bad++; }
  rows.push({id, label, combined:s, ssim:r.ssim, sizeScore:r.sizeScore, error:r.error});
}

console.log(`EPS diagrams: ${epsIDs.length}`);
console.log(`  Good (>=0.95): ${good}`);
console.log(`  Fair (>=0.85): ${fair}`);
console.log(`  Poor (>=0.70): ${poor}`);
console.log(`  Bad/Err:       ${bad}`);
console.log(`  No SSIM data:  ${missing}`);

console.log('\nWorst EPS diagrams:');
const sorted = rows.filter(r=>r.combined!=null).sort((a,b)=>a.combined-b.combined);
for (const r of sorted.slice(0,15)) {
  console.log(`  ${r.id}: ${r.label} combined=${r.combined.toFixed(4)} ssim=${r.ssim.toFixed(4)} size=${r.sizeScore.toFixed(4)}${r.error?' '+r.error:''}`);
}

console.log('\nBest EPS diagrams (top 5):');
for (const r of sorted.slice(-5).reverse()) {
  console.log(`  ${r.id}: ${r.label} combined=${r.combined.toFixed(4)} ssim=${r.ssim.toFixed(4)} size=${r.sizeScore.toFixed(4)}`);
}
