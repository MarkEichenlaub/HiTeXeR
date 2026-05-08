// auto-fix/build-canary.js
// Build auto-fix/canary.json by selecting ~50 representative IDs from
// ssim-results.json (for stratification) then LIVE-RENDERING each one
// with the current interpreter so baselines always match what
// render-and-score.js --canary will measure.
//
// Output: { "<id>": <liveRenderedSsim>, ... }
'use strict';

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SSIM_RESULTS_PATH = path.join(ROOT, 'comparison', 'ssim-results.json');
const MANIFEST_PATH     = path.join(ROOT, 'comparison', 'blink-manifest.json');
const OUT_PATH          = path.join(__dirname, 'canary.json');

const TIER_COUNTS = { high: 15, mid: 20, low: 15 }; // total 50
const MAJOR_COLLECTIONS = ['c10', 'c36', 'c53', 'c57', 'c71', 'gallery'];
const MIN_PER_MAJOR = 2;

function collectionOf(corpusFile) {
  if (!corpusFile) return 'unknown';
  if (corpusFile.startsWith('gallery_')) return 'gallery';
  const m = corpusFile.match(/^([a-z]+\d+)_/i);
  return m ? m[1] : (corpusFile.split('_')[0] || 'unknown');
}

function tierOf(ssim) {
  if (ssim >= 0.9) return 'high';
  if (ssim >= 0.75) return 'mid';
  return 'low';
}

function seededShuffle(arr, seed) {
  // deterministic shuffle (Mulberry32) so reruns of build-canary produce the same set
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function main() {
  if (!fs.existsSync(SSIM_RESULTS_PATH)) {
    console.error('ssim-results.json not found at ' + SSIM_RESULTS_PATH);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(SSIM_RESULTS_PATH, 'utf8'));

  // Optional: filter to IDs with a valid asy_src + texer_pngs reference
  const ASY_SRC_DIR = path.join(ROOT, 'comparison', 'asy_src');
  const TEXER_DIR   = path.join(ROOT, 'comparison', 'texer_pngs');
  const valid = rows.filter(r =>
    r && typeof r.ssim === 'number' &&
    fs.existsSync(path.join(ASY_SRC_DIR, r.id + '.asy')) &&
    fs.existsSync(path.join(TEXER_DIR, r.id + '.png'))
  );

  // Bucketize by tier and collection
  const buckets = {}; // tier -> collection -> array
  for (const r of valid) {
    const tier = tierOf(r.ssim);
    const col = collectionOf(r.corpusFile);
    if (!buckets[tier]) buckets[tier] = {};
    if (!buckets[tier][col]) buckets[tier][col] = [];
    buckets[tier][col].push(r);
  }

  // Shuffle each bucket deterministically
  for (const tier of Object.keys(buckets)) {
    for (const col of Object.keys(buckets[tier])) {
      buckets[tier][col] = seededShuffle(buckets[tier][col], 0xC0FFEE ^ stringHash(tier + col));
    }
  }

  const picked = new Map(); // id -> ssim

  // Pass 1: ensure MIN_PER_MAJOR per major collection, taken from whichever tier has rows.
  for (const col of MAJOR_COLLECTIONS) {
    let needed = MIN_PER_MAJOR;
    for (const tier of ['mid', 'high', 'low']) {
      const pool = (buckets[tier] && buckets[tier][col]) || [];
      while (needed > 0 && pool.length) {
        const r = pool.shift();
        if (!picked.has(r.id)) { picked.set(r.id, r.ssim); needed--; }
      }
      if (needed === 0) break;
    }
  }

  // Pass 2: fill each tier up to its quota, proportional across collections (round-robin).
  for (const tier of Object.keys(TIER_COUNTS)) {
    const quota = TIER_COUNTS[tier];
    const current = [...picked.entries()].filter(([id, s]) => tierOf(s) === tier).length;
    let need = quota - current;
    if (need <= 0) continue;
    const cols = Object.keys(buckets[tier] || {});
    // round-robin draw
    let made = true;
    while (need > 0 && made) {
      made = false;
      for (const col of cols) {
        if (need <= 0) break;
        const pool = buckets[tier][col];
        while (pool.length) {
          const r = pool.shift();
          if (!picked.has(r.id)) { picked.set(r.id, r.ssim); need--; made = true; break; }
        }
      }
    }
  }

  // If still under 50, top up from any remaining valid rows (tier/collection agnostic).
  if (picked.size < 50) {
    const pool = seededShuffle(valid.filter(r => !picked.has(r.id)), 0xFEEDBEEF);
    while (picked.size < 50 && pool.length) {
      const r = pool.shift();
      picked.set(r.id, r.ssim);
    }
  }

  // Live-render each selected ID so the baseline matches what the current
  // interpreter actually produces.  Fall back to ssim-results.json score
  // only if rendering fails for a given ID.
  const selectedIds = [...picked.keys()].sort();
  console.log('live-rendering ' + selectedIds.length + ' canary IDs...');
  const renderResult = cp.spawnSync(
    process.execPath,
    [path.join(__dirname, 'render-and-score.js'), '--ids', selectedIds.join(',')],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 }
  );
  const liveScores = new Map();
  for (const line of (renderResult.stdout || '').split('\n')) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.id && typeof obj.ssim === 'number') liveScores.set(obj.id, obj.ssim);
    } catch {}
  }
  if (liveScores.size === 0) {
    console.error('WARNING: live render produced no scores (stderr: ' + (renderResult.stderr||'').slice(0,200) + ')');
    console.error('Falling back to ssim-results.json scores — canary may not match live renders');
  } else {
    console.log('live scores obtained for ' + liveScores.size + '/' + selectedIds.length + ' IDs');
  }

  const out = {};
  for (const id of selectedIds) {
    // Prefer live-rendered score; fall back to ssim-results.json if render failed.
    out[id] = liveScores.has(id) ? liveScores.get(id) : picked.get(id);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  // Stats
  const stats = { total: Object.keys(out).length, byTier: {}, byCollection: {} };
  for (const [id, ssim] of Object.entries(out)) {
    const tier = tierOf(ssim);
    stats.byTier[tier] = (stats.byTier[tier]||0) + 1;
    const row = rows.find(r => r.id === id);
    const col = row ? collectionOf(row.corpusFile) : 'unknown';
    stats.byCollection[col] = (stats.byCollection[col]||0) + 1;
  }
  console.log('wrote ' + OUT_PATH);
  console.log(JSON.stringify(stats, null, 2));
}

// ── --update mode: ratchet existing baselines up, never down ─────────────────
// Re-renders every ID already in canary.json and sets
//   new_baseline = max(old_baseline, current_score)
// Baselines can only rise (locking in improvements) but never fall
// (regressions are not forgiven — they keep failing until fixed).
// Call this after every successful commit so the canary stays current
// without losing protection against re-breaking recently improved diagrams.
function runUpdate() {
  if (!fs.existsSync(OUT_PATH)) {
    console.error('[build-canary] canary.json not found; run without --update first');
    process.exit(1);
  }
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  const ids = Object.keys(existing).sort();
  if (ids.length === 0) { console.log('[build-canary] canary.json is empty, nothing to update'); return; }

  const renderResult = cp.spawnSync(
    process.execPath,
    [path.join(__dirname, 'render-and-score.js'), '--ids', ids.join(',')],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 }
  );
  const liveScores = new Map();
  for (const line of (renderResult.stdout || '').split('\n')) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.id && typeof obj.ssim === 'number') liveScores.set(obj.id, obj.ssim);
    } catch {}
  }
  if (liveScores.size === 0) {
    console.error('[build-canary] --update: live render produced no scores; canary unchanged');
    return;
  }

  let raised = 0, unchanged = 0, noScore = 0;
  const out = {};
  for (const id of ids) {
    const old  = existing[id];
    const live = liveScores.has(id) ? liveScores.get(id) : null;
    if (live === null) { out[id] = old; noScore++; continue; }
    const next = Math.max(old, live);
    if (next > old) raised++;
    else unchanged++;
    out[id] = next;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('[build-canary] ratchet: ' + raised + ' raised, ' + unchanged + ' unchanged, ' + noScore + ' no-score (kept old)');
}

function stringHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

if (process.argv.includes('--update')) {
  runUpdate();
} else {
  main();
}
