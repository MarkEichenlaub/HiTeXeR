#!/usr/bin/env node
// Compute a corpus-wide SSIM statistics checkpoint and append it to
// comparison/ssim-stats-history.json (the data the comparator stats page reads).
//
// Run automatically after every FULL ssim recompute (ssim-pipeline.js `ssim`
// step → see hook there; also covers the auto-fix loop's runFullPipeline), or
// manually:  node auto-fix/compute-ssim-stats.js [--force]
//
// Each checkpoint stores: count, mean, median, min, max, range, percentiles
// (1/10/25/50/75/90/99), a 0.02-binned histogram, and — from the SECOND
// checkpoint on — a diff vs the previous checkpoint: how many ids increased /
// decreased, the 20 biggest increases and 20 biggest decreases (padded with the
// smallest increases when fewer than 20 ids decreased), and the list of git
// commits landed since the previous checkpoint.
//
// To diff without bloating the history file with a full per-id score map per
// checkpoint, the latest run's raw scores are kept in
// auto-fix/ssim-stats-last-scores.json (overwritten each run) and diffed next
// time. Both files are committed so checkpoints are durable across clones.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SSIM_RESULTS = path.join(ROOT, 'comparison', 'ssim-results.json');
const HISTORY_PATH = path.join(ROOT, 'comparison', 'ssim-stats-history.json');
const LAST_SCORES_PATH = path.join(__dirname, 'ssim-stats-last-scores.json');

const EPS = 1e-6; // delta magnitude below which a score is "unchanged"

function sh(cmd) {
  try { return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function percentile(sorted, p) {
  // Linear-interpolation percentile over an ascending-sorted array.
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function buildHistogram(values, binSize, loBound = 0) {
  // Bins span [loBound, 1.0]; values below loBound are skipped (the SSIM
  // distribution is tightly packed near 1.0, so the low tail just wastes width).
  const nBins = Math.round((1 - loBound) / binSize); // 40 bins for 0.005 over [0.8,1.0]
  const bins = [];
  for (let i = 0; i < nBins; i++) {
    bins.push({
      lo: +(loBound + i * binSize).toFixed(4),
      hi: +(loBound + (i + 1) * binSize).toFixed(4),
      count: 0,
    });
  }
  for (const v of values) {
    if (v < loBound) continue; // skip the low tail
    let idx = Math.floor((v - loBound) / binSize);
    if (idx >= nBins) idx = nBins - 1; // include 1.0 in the last bin
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

function main() {
  const force = process.argv.includes('--force');

  if (!fs.existsSync(SSIM_RESULTS)) {
    console.error('[ssim-stats] ssim-results.json not found; run the ssim step first.');
    process.exit(1);
  }
  const results = JSON.parse(fs.readFileSync(SSIM_RESULTS, 'utf8'));

  // Build id -> ssim map, skipping entries without a finite ssim.
  const scores = {};
  for (const r of results) {
    if (r && typeof r.ssim === 'number' && isFinite(r.ssim)) scores[r.id] = r.ssim;
  }
  const values = Object.values(scores).sort((a, b) => a - b);
  if (values.length === 0) {
    console.error('[ssim-stats] no finite ssim scores found; nothing to checkpoint.');
    process.exit(1);
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const min = values[0], max = values[values.length - 1];

  const commitFull = sh('git rev-parse HEAD');
  const commit = sh('git rev-parse --short HEAD') || (commitFull || '').slice(0, 8);
  const timestamp = new Date().toISOString();

  // ── Load previous checkpoint's raw scores for the diff ──────────────────
  let prev = null;
  if (fs.existsSync(LAST_SCORES_PATH)) {
    try { prev = JSON.parse(fs.readFileSync(LAST_SCORES_PATH, 'utf8')); } catch { prev = null; }
  }

  // Skip a no-op checkpoint (same commit AND identical scores) unless --force.
  if (!force && prev && prev.commitFull === commitFull) {
    const prevIds = Object.keys(prev.scores || {});
    const sameCount = prevIds.length === Object.keys(scores).length;
    let identical = sameCount;
    if (identical) {
      for (const id of prevIds) {
        if (Math.abs((prev.scores[id] ?? NaN) - (scores[id] ?? NaN)) > EPS) { identical = false; break; }
      }
    }
    if (identical) {
      console.log('[ssim-stats] scores unchanged since last checkpoint (' + commit + '); skipping. Use --force to override.');
      return;
    }
  }

  let vsPrev = null;
  if (prev && prev.scores) {
    const movers = [];
    let increased = 0, decreased = 0, unchanged = 0, added = 0;
    for (const [id, to] of Object.entries(scores)) {
      const from = prev.scores[id];
      if (typeof from !== 'number') { added++; continue; }
      const delta = to - from;
      if (delta > EPS) increased++;
      else if (delta < -EPS) decreased++;
      else unchanged++;
      movers.push({ id, from, to, delta });
    }
    let removed = 0;
    for (const id of Object.keys(prev.scores)) { if (!(id in scores)) removed++; }

    const byDeltaDesc = movers.slice().sort((a, b) => b.delta - a.delta);
    const byDeltaAsc = movers.slice().sort((a, b) => a.delta - b.delta);

    const round = (m) => ({ id: m.id, from: +m.from.toFixed(6), to: +m.to.toFixed(6), delta: +m.delta.toFixed(6) });
    const topIncreases = byDeltaDesc.filter(m => m.delta > EPS).slice(0, 20).map(round);

    // Biggest decreases; if fewer than 20 ids decreased, pad with the smallest
    // increases (deltas closest to zero, still > 0) per the spec.
    const decreases = byDeltaAsc.filter(m => m.delta < -EPS).slice(0, 20);
    let topDecreases = decreases.map(round);
    if (topDecreases.length < 20) {
      const need = 20 - topDecreases.length;
      const smallestIncreases = byDeltaDesc
        .filter(m => m.delta > EPS)
        .slice(-need)            // the smallest positive deltas
        .reverse();              // present smallest-first
      topDecreases = topDecreases.concat(smallestIncreases.map(round));
    }

    // Commits since the previous checkpoint.
    let commits = [];
    if (prev.commitFull && prev.commitFull !== commitFull) {
      const log = sh('git log ' + prev.commitFull + '..HEAD --pretty=format:%h%x09%s');
      if (log) {
        commits = log.split('\n').map(line => {
          const tab = line.indexOf('\t');
          return tab >= 0 ? { hash: line.slice(0, tab), subject: line.slice(tab + 1) } : { hash: line, subject: '' };
        });
      }
    }

    vsPrev = {
      prevCommit: prev.commit, prevTimestamp: prev.timestamp,
      increased, decreased, unchanged, added, removed,
      decreasedActualCount: decreases.length,
      topIncreases, topDecreases, commits,
    };
  }

  const checkpoint = {
    timestamp, commit, commitFull,
    count: values.length,
    mean: +mean.toFixed(6),
    median: +percentile(values, 50).toFixed(6),
    min: +min.toFixed(6),
    max: +max.toFixed(6),
    range: +(max - min).toFixed(6),
    percentiles: {
      p1: +percentile(values, 1).toFixed(6),
      p10: +percentile(values, 10).toFixed(6),
      p25: +percentile(values, 25).toFixed(6),
      p50: +percentile(values, 50).toFixed(6),
      p75: +percentile(values, 75).toFixed(6),
      p90: +percentile(values, 90).toFixed(6),
      p99: +percentile(values, 99).toFixed(6),
    },
    histogram: buildHistogram(values, 0.005, 0.8),
    vsPrev,
  };

  let history = [];
  if (fs.existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { history = []; }
    if (!Array.isArray(history)) history = [];
  }
  history.push(checkpoint);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // Persist this run's raw scores for the next diff.
  fs.writeFileSync(LAST_SCORES_PATH, JSON.stringify({ commit, commitFull, timestamp, scores }, null, 2));

  const deltaNote = vsPrev
    ? ' | vs prev: +' + vsPrev.increased + ' / -' + vsPrev.decreased + ' (' + vsPrev.commits.length + ' commits)'
    : ' | first checkpoint';
  console.log('[ssim-stats] checkpoint ' + commit + ': n=' + checkpoint.count +
    ' mean=' + checkpoint.mean.toFixed(4) + ' median=' + checkpoint.median.toFixed(4) +
    ' p10=' + checkpoint.percentiles.p10.toFixed(4) + deltaNote);
}

main();
