// auto-fix/build-canary.js
// One-time: build auto-fix/canary.json from comparison/ssim-results.json.
// Samples ~50 IDs stratified across collections and SSIM tiers.
//
// Output: { "<id>": <baselineSsim>, ... }
'use strict';

const fs   = require('fs');
const path = require('path');

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

  const out = {};
  for (const [id, ssim] of [...picked.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) out[id] = ssim;

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

function stringHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

main();
