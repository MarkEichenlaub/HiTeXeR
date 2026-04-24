'use strict';
// Re-render the N worst-scoring diagrams and update ssim-results.json.
// Usage: node rerender-worst.js [N]   (default N=500)
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT      = __dirname;
const SSIM_PATH = path.join(ROOT, 'comparison', 'ssim-results.json');
const N         = parseInt(process.argv[2] || '500', 10);

if (!fs.existsSync(SSIM_PATH)) {
  console.error('comparison/ssim-results.json not found. Run the full pipeline first.');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(SSIM_PATH, 'utf8'));
if (results.length === 0) { console.error('ssim-results.json is empty.'); process.exit(1); }

const count  = Math.min(N, results.length);
const worst  = results.slice(0, count);
const ids    = worst.map(r => r.id);

console.log(`Re-rendering ${count} worst diagrams`);
console.log(`  combined score range: ${worst[0].combined.toFixed(4)} … ${worst[count - 1].combined.toFixed(4)}`);

// Pipe IDs via stdin to render-and-score.js
const proc = spawnSync(
  process.execPath,
  [path.join(ROOT, 'auto-fix', 'render-and-score.js')],
  {
    input: ids.join('\n'),
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 20 * 1024 * 1024,
  }
);

if (proc.error) { console.error('spawn error:', proc.error); process.exit(1); }

// Parse per-ID result lines
const newScores = new Map();
let summary = null;
for (const line of (proc.stdout || '').split('\n')) {
  const s = line.trim();
  if (!s) continue;
  try {
    const obj = JSON.parse(s);
    if (obj.summary)                          { summary = obj.summary; }
    else if (obj.id && obj.ssim != null)      { newScores.set(obj.id, obj); }
    else if (obj.id && obj.err)               { console.log(`  [skip] ${obj.id}: ${obj.err}`); }
  } catch {}
}

console.log(`\nScored ${newScores.size}/${count} IDs`);
if (summary) {
  console.log(`  errors=${summary.errors}  worstDelta=${summary.worstDelta != null ? summary.worstDelta.toFixed(4) : 'n/a'}  regression=${summary.regression}`);
}

// Patch ssim-results.json in-place
const byId = new Map(results.map(r => [r.id, r]));
let updated = 0;
for (const [id, row] of newScores) {
  const existing = byId.get(id);
  if (!existing) continue;
  existing.ssim      = row.ssim;
  existing.sizeScore = row.sizeScore;
  existing.combined  = row.combined;
  if (row.combined != null && row.combined >= 0) delete existing.error;
  updated++;
}
results.sort((a, b) => a.combined - b.combined);
fs.writeFileSync(SSIM_PATH, JSON.stringify(results, null, 2));
console.log(`Updated ${updated} entries in ssim-results.json`);

// Regenerate HTML
console.log('\nRegenerating comparison HTML...');
execSync(`node "${path.join(ROOT, 'ssim-pipeline.js')}" html`, { cwd: ROOT, stdio: 'inherit' });
