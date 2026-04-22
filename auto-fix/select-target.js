// auto-fix/select-target.js
// Pick the next target for the auto-fix loop.
//
// Criteria: sizeScore >= 0.7 AND ssim < 0.75 AND id NOT IN skiplist
//           AND (no attempt in last 24h OR attempts < 3 non-fix verdicts).
//
// Emits a JSON object to stdout:
//   { id, corpusFile, collection, lesson, familyKey, ssim, asyPath, refPng, htxPng }
// or the literal word "DONE" if no candidate remains.
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPARISON = path.join(ROOT, 'comparison');
const SSIM_RESULTS_PATH = path.join(COMPARISON, 'ssim-results.json');
const ATTEMPTS_PATH     = path.join(__dirname, 'attempts.jsonl');
const SKIPLIST_PATH     = path.join(__dirname, 'skiplist.json');

const MIN_SIZE_SCORE   = 0.7;
const MAX_SSIM         = 0.75;
const RECENT_WINDOW_MS = 24 * 3600 * 1000;

function loadJson(p, dflt) {
  if (!fs.existsSync(p)) return dflt;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; }
}

function loadAttempts() {
  if (!fs.existsSync(ATTEMPTS_PATH)) return [];
  const raw = fs.readFileSync(ATTEMPTS_PATH, 'utf8');
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* ignore bad line */ }
  }
  return out;
}

function collectionOf(corpusFile) {
  if (!corpusFile) return 'unknown';
  if (corpusFile.startsWith('gallery_')) return 'gallery';
  const m = corpusFile.match(/^([a-z]+\d+)_/i);
  return m ? m[1] : (corpusFile.split('_')[0] || 'unknown');
}

function lessonOf(corpusFile) {
  if (!corpusFile) return null;
  const m = corpusFile.match(/_L(\d+)_/);
  return m ? 'L' + m[1] : null;
}

function familyKeyOf(corpusFile) {
  const col = collectionOf(corpusFile);
  const les = lessonOf(corpusFile);
  return les ? col + '_' + les : col;
}

function parseArgs(argv) {
  const out = { id: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') out.id = argv[++i];
  }
  return out;
}

function emit(pick) {
  const collection = collectionOf(pick.corpusFile);
  const lesson     = lessonOf(pick.corpusFile);
  const familyKey  = familyKeyOf(pick.corpusFile);
  const out = {
    id: pick.id,
    corpusFile: pick.corpusFile,
    collection,
    lesson,
    familyKey,
    ssim: pick.ssim,
    sizeScore: pick.sizeScore,
    asyPath: path.join(COMPARISON, 'asy_src', pick.id + '.asy'),
    refPng:  path.join(COMPARISON, 'texer_pngs', pick.id + '.png'),
    htxPng:  path.join(COMPARISON, 'htx_pngs', pick.id + '.png')
  };
  process.stdout.write(JSON.stringify(out) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = loadJson(SSIM_RESULTS_PATH, []);

  // --id X bypasses candidate filtering entirely: caller has already chosen
  // the target (e.g. run-loop.js --ids). We still need ssim-results to build
  // the metadata record, but filters / skiplist / cooldown are irrelevant.
  if (args.id) {
    const pick = rows.find(r => r.id === args.id);
    if (!pick) { process.stderr.write('id not found in ssim-results: ' + args.id + '\n'); process.exit(1); }
    emit(pick);
    return;
  }

  const skiplist = new Set(loadJson(SKIPLIST_PATH, { ids: [] }).ids || []);
  const attempts = loadAttempts();

  // attempts index: id -> array of verdicts (most-recent-last)
  const attemptsById = new Map();
  for (const a of attempts) {
    if (!a.id) continue;
    if (!attemptsById.has(a.id)) attemptsById.set(a.id, []);
    attemptsById.get(a.id).push(a);
  }

  const now = Date.now();
  const candidates = [];
  for (const r of rows) {
    if (!r || typeof r.ssim !== 'number') continue;
    if (r.sizeScore < MIN_SIZE_SCORE) continue;
    if (r.ssim >= MAX_SSIM) continue;
    if (skiplist.has(r.id)) continue;
    const history = attemptsById.get(r.id) || [];
    // Permanent skip verdicts
    if (history.some(a => a.verdict === 'fix' || a.verdict === 'ssim-artifact')) continue;
    // Retry budget for non-fix verdicts
    const nonFixAttempts = history.filter(a =>
      ['attempted-no-improve','regressed-canary','unfixable-feature','error'].includes(a.verdict)
    );
    if (nonFixAttempts.length >= 3) continue;
    // 24h cooldown after the most recent attempt
    const last = history.length ? history[history.length - 1] : null;
    if (last && last.ts) {
      const t = Date.parse(last.ts);
      if (!Number.isNaN(t) && now - t < RECENT_WINDOW_MS) continue;
    }
    candidates.push(r);
  }

  candidates.sort((a,b) => a.ssim - b.ssim);

  const pick = candidates[0];
  if (!pick) { process.stdout.write('DONE\n'); return; }
  emit(pick);
}

main();
