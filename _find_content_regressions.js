// Find content-level regressions: good size match but bad SSIM.
'use strict';
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('comparison/ssim-results.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('comparison/blink-manifest.json', 'utf8'));

// Build id -> source map
const idToSource = {};
for (const coll of Object.values(manifest.collections || {})) {
  for (const d of (coll.diagrams || [])) {
    idToSource[d.id] = d.source || d.asy || '';
  }
}
// Fallback: flat diagrams list
if (manifest.diagrams) {
  for (const d of manifest.diagrams) idToSource[d.id] = d.source || d.asy || '';
}

// Content regression: sizeScore >= 0.7 (dims reasonable) but ssim < 0.75.
const regs = results.filter(r => r.sizeScore >= 0.7 && r.ssim < 0.75);
for (const r of regs) r.source = idToSource[r.id] || '';
regs.sort((a, b) => a.ssim - b.ssim);

console.log(`Found ${regs.length} content regressions (sizeScore>=0.7, ssim<0.75)`);
console.log('ID     SSIM   wR    hR    ref        htx        source');
for (const r of regs.slice(0, 50)) {
  const ref = r.refDims?.join('x') || '?';
  const htx = r.htxDims?.join('x') || '?';
  console.log(
    r.id,
    r.ssim.toFixed(3),
    (r.wRatio ?? 0).toFixed(2),
    (r.hRatio ?? 0).toFixed(2),
    ref.padStart(10),
    htx.padStart(10),
    r.source
  );
}

// Group by lesson
const byLesson = {};
for (const r of regs) {
  const m = (r.source || '').match(/^(c\d+_L\d+|gallery[_a-z]*)/);
  const key = m ? m[1] : 'other';
  if (!byLesson[key]) byLesson[key] = [];
  byLesson[key].push(r);
}
console.log('\nBy lesson (top 15 with count>=3):');
const lessonEntries = Object.entries(byLesson).filter(e => e[1].length >= 3).sort((a, b) => b[1].length - a[1].length);
for (const [lesson, items] of lessonEntries.slice(0, 15)) {
  const mean = items.reduce((s, r) => s + r.ssim, 0) / items.length;
  console.log(lesson.padEnd(14), 'count=', String(items.length).padStart(3), 'meanSsim=', mean.toFixed(3), 'ex:', items.slice(0,4).map(x=>x.id).join(','));
}
