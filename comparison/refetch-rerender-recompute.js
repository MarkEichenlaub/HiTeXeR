'use strict';
/**
 * refetch-rerender-recompute.js  (items 4/5/6/11/12)
 *
 * One pass that, for a chosen set of diagram IDs:
 *   1. (optional) un-excludes IDs that were corrupted by the scraper \t/\n bug
 *      and have since been repaired (droplist/skiplist ∩ repaired set).
 *   2. Re-fetches the TeXeR reference PNG (parallel workers). If TeXeR refuses to
 *      compile a diagram, the ID is added to the droplist (excluded) with a reason.
 *   3. Re-renders the diagram with HiTeXeR and recomputes SSIM. If HiTeXeR fails
 *      but TeXeR rendered, the diagram gets ssim/combined = 0 (bottom of barrel).
 *   4. Upserts comparison/ssim-results.json and regenerates the blink manifest.
 *
 * The union ID set is assembled from any combination of:
 *   --range A-B          inclusive numeric range, zero-padded to 5 (e.g. 12850-12999)
 *   --repaired           comparison/tab-repaired-ids.json (the \t/\n fix output)
 *   --missing            every asy_src ID lacking a texer OR htx PNG
 *   --ids a,b,c          explicit list
 *   --ids-file path      whitespace/comma/newline separated
 *
 * Other flags:
 *   --workers N          parallel refetch workers (default 4)
 *   --batch N            render-and-score chunk size (default 120)
 *   --jobs N             parallel render-and-score processes in step 2
 *                        (default: cpus-1). Each renders a separate chunk;
 *                        aggregation is single-threaded so results never race.
 *   --no-refetch         skip the TeXeR refetch step (rerender + recompute only)
 *   --skip-fresh N       resume helper: don't re-fetch ids whose texer PNG was
 *                        modified within the last N minutes (they were just
 *                        fetched in an interrupted run); they're still rerendered
 *                        and rescored in step 2.
 *   --dry-run            print the union set and planned un-excludes, do nothing
 */
const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const ASY_SRC = path.join(ROOT, 'comparison', 'asy_src');
const TEXER = path.join(ROOT, 'comparison', 'texer_pngs');
const HTX = path.join(ROOT, 'comparison', 'htx_pngs');
const SSIM_FILE = path.join(ROOT, 'comparison', 'ssim-results.json');
const DROPLIST = path.join(ROOT, 'auto-fix', 'droplist.json');
const SKIPLIST = path.join(ROOT, 'auto-fix', 'skiplist.json');
const REPAIRED = path.join(ROOT, 'comparison', 'tab-repaired-ids.json');
const LOG = path.join(ROOT, 'comparison', 'rrr-summary.json');

function pad(id) { return String(id).padStart(5, '0'); }
function readJson(p, dflt) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } }

// ── args ────────────────────────────────────────────────────────
const A = process.argv.slice(2);
const opt = { workers: 3, batch: 120, refetch: true, dryRun: false, range: null, repaired: false, missing: false, ids: [], idsFile: null,
  throttleMs: 0, failBurst: 6, cooldownMs: 60000, cooldownMaxMs: 300000, skipFreshMin: 0,
  jobs: Math.max(1, (os.cpus().length || 2) - 1) };
for (let i = 0; i < A.length; i++) {
  const a = A[i];
  if (a === '--range') opt.range = A[++i];
  else if (a === '--repaired') opt.repaired = true;
  else if (a === '--missing') opt.missing = true;
  else if (a === '--ids') opt.ids = opt.ids.concat((A[++i] || '').split(/[\s,]+/).filter(Boolean));
  else if (a === '--ids-file') opt.idsFile = A[++i];
  else if (a === '--workers') opt.workers = parseInt(A[++i], 10) || 3;
  else if (a === '--batch') opt.batch = parseInt(A[++i], 10) || 120;
  else if (a === '--jobs') opt.jobs = Math.max(1, parseInt(A[++i], 10) || 1);
  else if (a === '--throttle-ms') opt.throttleMs = parseInt(A[++i], 10) || 0;
  else if (a === '--fail-burst') opt.failBurst = parseInt(A[++i], 10) || 6;
  else if (a === '--cooldown-ms') opt.cooldownMs = parseInt(A[++i], 10) || 60000;
  else if (a === '--cooldown-max-ms') opt.cooldownMaxMs = parseInt(A[++i], 10) || 300000;
  else if (a === '--skip-fresh') opt.skipFreshMin = parseFloat(A[++i]) || 0;
  else if (a === '--no-refetch') opt.refetch = false;
  else if (a === '--dry-run') opt.dryRun = true;
  else { console.error('unknown arg: ' + a); process.exit(2); }
}

// ── build union ID set ──────────────────────────────────────────
// Two sets are tracked separately:
//   union     — everything that needs rerender + SSIM rescore (step 2)
//   refetchSet — the subset that needs a fresh TeXeR fetch (step 1)
// A diagram missing only its HiTeXeR render (htx png) needs a rerender but NOT
// a texer refetch — its texer reference is fine. Re-fetching all of those is
// what balloons a "missing" run into ~1000 fetches and trips TeXeR rate limits.
const srcIds = new Set(fs.readdirSync(ASY_SRC).filter(f => f.endsWith('.asy')).map(f => f.slice(0, -4)));
const union = new Set();
const refetchSet = new Set();
if (opt.range) {
  const m = opt.range.match(/^(\d+)-(\d+)$/);
  if (!m) { console.error('bad --range; want A-B'); process.exit(2); }
  // Range is an INTENTIONAL refetch (e.g. the cache-mismatch range 12881-12990).
  for (let n = parseInt(m[1], 10); n <= parseInt(m[2], 10); n++) { const id = pad(n); if (srcIds.has(id)) { union.add(id); refetchSet.add(id); } }
}
// Repaired sources changed (\t/\n fix) ⇒ their texer must be refetched.
if (opt.repaired) for (const id of readJson(REPAIRED, [])) if (srcIds.has(pad(id))) { union.add(pad(id)); refetchSet.add(pad(id)); }
if (opt.missing) {
  const tex = new Set(fs.readdirSync(TEXER).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
  const htx = new Set(fs.readdirSync(HTX).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
  for (const id of srcIds) {
    if (!tex.has(id) || !htx.has(id)) union.add(id);  // either missing ⇒ needs rescore
    if (!tex.has(id)) refetchSet.add(id);              // only missing-texer ⇒ needs fetch
  }
}
// Explicit ids/idsFile are intentional refetches.
for (const id of opt.ids) if (srcIds.has(pad(id))) { union.add(pad(id)); refetchSet.add(pad(id)); }
if (opt.idsFile) for (const id of fs.readFileSync(path.resolve(ROOT, opt.idsFile), 'utf8').split(/[\s,]+/).filter(Boolean)) if (srcIds.has(pad(id))) { union.add(pad(id)); refetchSet.add(pad(id)); }

const ids = [...union].sort();
console.log(`Union ID set: ${ids.length} (refetch ${refetchSet.size}, rerender-only ${ids.length - refetchSet.size})`);

// ── un-exclude bug-affected diagrams (items 11/12) ──────────────
const repairedSet = new Set(readJson(REPAIRED, []).map(pad));
let droplist = readJson(DROPLIST, []);
let skip = readJson(SKIPLIST, { ids: [] });
const unexcluded = [];
if (!opt.dryRun) {
  const dropBefore = droplist.length;
  droplist = droplist.filter(id => {
    if (repairedSet.has(pad(id))) { unexcluded.push(pad(id)); union.add(pad(id)); refetchSet.add(pad(id)); return false; }
    return true;
  });
  skip.ids = (skip.ids || []).filter(id => {
    if (repairedSet.has(pad(id))) { unexcluded.push(pad(id)); union.add(pad(id)); refetchSet.add(pad(id)); return false; }
    return true;
  });
  if (dropBefore !== droplist.length) fs.writeFileSync(DROPLIST, JSON.stringify(droplist, null, 2));
  fs.writeFileSync(SKIPLIST, JSON.stringify(skip, null, 2));
  if (unexcluded.length) console.log(`Un-excluded ${unexcluded.length} repaired diagram(s): ${unexcluded.join(', ')}`);
} else {
  for (const id of [...droplist, ...(skip.ids || [])]) if (repairedSet.has(pad(id))) unexcluded.push(pad(id));
  console.log(`(dry-run) would un-exclude: ${unexcluded.join(', ') || '(none)'}`);
}
// recompute final id list including any newly un-excluded
const finalIds = [...union].sort();

if (opt.dryRun) {
  console.log('Final union (' + finalIds.length + '):');
  console.log(finalIds.join(' '));
  process.exit(0);
}

// ── step 1: parallel TeXeR refetch ──────────────────────────────
// A failure in the parallel pass is NOT trusted: under N parallel Selenium
// browsers, TeXeR throws rate-limit / transient modals that refetch-single.py
// can only see as "compile_error". Those used to get permanently added to the
// droplist, wrongly excluding dozens of perfectly valid diagrams. Instead, every
// parallel failure is re-verified SERIALLY (one worker) before any exclusion.
const compileErrors = [];   // parallel pass said texer refused (UNVERIFIED)
const refetchFail = [];     // other parallel failures (timeout etc.)

// TeXeR rate-limits after a burst of fetches (≈60 in a short window), at which
// point it refuses everything for a while regardless of worker count. A flat
// parallel pass therefore stalls: ~60 ok, then a long tail of false failures.
// To finish a large run we watch for a BURST of consecutive failures (the
// rate-limit signature) and pause ALL workers for an escalating cooldown so the
// limit can reset, then resume. Successes reset the failure streak; a healthy
// streak de-escalates the cooldown back toward the floor.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function refetchAll(list) {
  let idx = 0, done = 0, ok = 0;
  let consecFail = 0, consecOk = 0;
  let cooldownUntil = 0;
  let cooldownMs = opt.cooldownMs;   // current (escalating) cooldown duration

  function runOne(id) {
    return new Promise(res => {
      const p = spawn('python', ['comparison/refetch-single.py', id], { cwd: ROOT, windowsHide: true });
      let out = '';
      p.stdout.on('data', d => out += d);
      p.stderr.on('data', () => {});
      p.on('close', () => res(out));
    });
  }

  async function worker() {
    for (;;) {
      // Honor an in-progress cooldown before grabbing more work.
      while (Date.now() < cooldownUntil) await sleep(500);
      if (idx >= list.length) return;
      const id = list[idx++];
      if (opt.throttleMs) await sleep(opt.throttleMs);
      const out = await runOne(id);
      done++;
      let r = {}; try { r = JSON.parse((out || '').trim() || '{}'); } catch {}
      if (r.ok) {
        ok++; consecOk++; consecFail = 0;
        // De-escalate after a healthy run of successes.
        if (consecOk >= 15 && cooldownMs > opt.cooldownMs) {
          cooldownMs = Math.max(opt.cooldownMs, Math.floor(cooldownMs / 2));
          consecOk = 0;
        }
      } else if (r.error && /compile_error/i.test(r.error)) {
        // A compile_error is a deterministic, permanent failure of THIS diagram
        // (it doesn't compile on TeXeR), not a rate-limit signal. It must NOT
        // count toward consecFail, or a cluster of genuinely-broken diagrams —
        // which front-load the sorted list once skip-fresh removes the
        // successes — falsely trips the cooldown and stalls the whole run.
        compileErrors.push(id); consecOk = 0;
      } else {
        refetchFail.push(id);
        consecFail++; consecOk = 0;
        // A burst of consecutive failures means the limit tripped — cool down.
        if (consecFail >= opt.failBurst && Date.now() >= cooldownUntil) {
          cooldownUntil = Date.now() + cooldownMs;
          process.stdout.write(`  ⏸ ${consecFail} consecutive failures (rate-limit signature) — cooling down ${Math.round(cooldownMs / 1000)}s\n`);
          consecFail = 0;
          cooldownMs = Math.min(opt.cooldownMaxMs, cooldownMs * 2);  // escalate for next time
        }
      }
      if (done % 20 === 0 || done === list.length)
        process.stdout.write(`  refetch [${done}/${list.length}] ok=${ok} fail(unverified)=${compileErrors.length + refetchFail.length}\n`);
    }
  }

  const workers = [];
  for (let w = 0; w < opt.workers; w++) workers.push(worker());
  await Promise.all(workers);
  return { ok };
}

function refetchOneSync(id) {
  const r = spawnSync('python', ['comparison/refetch-single.py', id], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  let o = {}; try { o = JSON.parse((r.stdout || '').trim() || '{}'); } catch {}
  return o;
}

// Re-run every parallel-pass failure serially (one at a time, small delay) to
// separate genuine TeXeR compile errors from transient rate-limit failures.
// Returns { genuineCompile, recovered, stillFail }.
async function verifyFailuresSerially(ids) {
  const genuineCompile = [], recovered = [], stillFail = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const o = refetchOneSync(id);
    if (o.ok) recovered.push(id);
    else if (o.error && /compile_error/i.test(o.error)) genuineCompile.push(id);
    else stillFail.push(id);
    if ((i + 1) % 10 === 0 || i === ids.length - 1)
      process.stdout.write(`  serial-verify [${i + 1}/${ids.length}] recovered=${recovered.length} genuineCompile=${genuineCompile.length} stillFail=${stillFail.length}\n`);
    await new Promise(r => setTimeout(r, 400));  // gentle pacing to avoid re-triggering rate limits
  }
  return { genuineCompile, recovered, stillFail };
}

// ── step 2: rerender + recompute SSIM (chunked) ─────────────────
function rerenderChunk(chunk) {
  // Spawn render-and-score for one chunk; resolve with parsed JSONL rows.
  // render-and-score.js only READS ssim-results.json and writes unique
  // per-id SVG/PNG, so concurrent chunks never race on a shared file.
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      [path.join(ROOT, 'auto-fix', 'render-and-score.js'), '--ids', chunk.join(',')],
      { cwd: ROOT });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', () => {});
    child.on('close', () => {
      const rows = [];
      for (const line of out.split('\n')) {
        const s = line.trim(); if (!s) continue;
        try { const o = JSON.parse(s); if (o.summary) continue; rows.push(o); } catch {}
      }
      resolve(rows);
    });
    child.on('error', () => resolve([]));
  });
}

// Final set of genuine TeXeR compile errors (verified one-at-a-time). Populated
// in step 1; consumed by step 2's exclude set. Starts empty so a --no-refetch
// run never excludes anything.
let genuineCompileErrors = [];

(async () => {
  if (opt.refetch) {
    // Only ids in refetchSet need a TeXeR fetch (range/repaired/explicit/
    // missing-texer); rerender-only ids skip step 1 entirely.
    let refetchList = [...refetchSet].filter(id => union.has(id)).sort();
    // Resume helper: skip re-fetching ids whose texer PNG is newer than the
    // cutoff (already fetched in an interrupted run). They stay in finalIds so
    // step 2 still rerenders + rescores them.
    if (opt.skipFreshMin > 0) {
      const cutoff = Date.now() - opt.skipFreshMin * 60 * 1000;
      const before = refetchList.length;
      refetchList = refetchList.filter(id => {
        try { return fs.statSync(path.join(TEXER, pad(id) + '.png')).mtimeMs < cutoff; }
        catch { return true; }  // missing png ⇒ must fetch
      });
      console.log(`  --skip-fresh ${opt.skipFreshMin}m: refetching ${refetchList.length} of ${before} (skipped ${before - refetchList.length} freshly-fetched)`);
    }
    console.log(`\n== Step 1: refetch TeXeR for ${refetchList.length} ids (workers=${opt.workers}) ==`);
    await refetchAll(refetchList);

    // The parallel pass classifies rate-limit/transient modals as compile errors.
    // Re-run EVERY parallel-pass failure serially before trusting it, so only ids
    // that still fail to compile when retried alone get dropped.
    const unverified = [...compileErrors, ...refetchFail];
    if (unverified.length) {
      console.log(`\n  verifying ${unverified.length} parallel-pass failures one-at-a-time (rate-limit guard)…`);
      const { genuineCompile, recovered, stillFail } = await verifyFailuresSerially(unverified);
      console.log(`  serial verify done: recovered=${recovered.length} genuineCompile=${genuineCompile.length} stillFail=${stillFail.length}`);
      if (stillFail.length) console.log(`  still-failing (non-compile, NOT dropped): ${stillFail.join(', ')}`);

      // Safety cap: if an implausibly large fraction "genuinely" fail to compile,
      // it's almost certainly sustained rate-limiting, not real errors. Abort the
      // droplist write and report for manual review rather than mass-excluding.
      const cap = Math.max(25, Math.ceil(finalIds.length * 0.10));
      if (genuineCompile.length > cap) {
        console.log(`\n  !! ABORT droplist: genuineCompile=${genuineCompile.length} exceeds safety cap ${cap}.`);
        console.log(`     This pattern indicates rate-limiting, not real compile errors. No ids dropped.`);
        console.log(`     Ids for manual review: ${genuineCompile.join(', ')}`);
        genuineCompileErrors = [];
      } else {
        genuineCompileErrors = genuineCompile;
        if (genuineCompile.length) {
          const dl = new Set(readJson(DROPLIST, []).map(pad));
          for (const id of genuineCompile) dl.add(pad(id));
          fs.writeFileSync(DROPLIST, JSON.stringify([...dl].sort(), null, 2));
          console.log(`  added ${genuineCompile.length} verified TeXeR-compile-error ids to droplist: ${genuineCompile.join(', ')}`);
        }
      }
    }
  } else {
    console.log('\n== Step 1: refetch skipped (--no-refetch) ==');
  }

  // Only recompute ids that are NOT excluded by a (verified) texer compile error.
  const exclude = new Set(genuineCompileErrors.map(pad));
  const toScore = finalIds.filter(id => !exclude.has(id));
  console.log(`\n== Step 2: rerender + recompute SSIM for ${toScore.length} ids (batch=${opt.batch}) ==`);

  const results = readJson(SSIM_FILE, []);
  const byId = new Map(results.map(r => [r.id, r]));
  let scored = 0, htxFail = 0, noTexer = 0, inserted = 0;

  // Split into chunks, then run up to opt.jobs render-and-score processes
  // concurrently. Aggregation runs in each chunk's await continuation —
  // single-threaded, so the shared results/byId/counters never race.
  const chunks = [];
  for (let i = 0; i < toScore.length; i += opt.batch) chunks.push(toScore.slice(i, i + opt.batch));
  console.log(`  ${chunks.length} chunk(s) × up to ${opt.jobs} parallel job(s)`);

  let done = 0;
  function aggregate(rows) {
    for (const row of rows) {
      const id = row.id;
      let rec = byId.get(id);
      if (!rec) { rec = { id, idx: parseInt(id, 10) - 1 }; results.push(rec); byId.set(id, rec); inserted++; }
      if (row.ssim != null) {
        rec.ssim = row.ssim; rec.sizeScore = row.sizeScore; rec.combined = row.combined;
        delete rec.error; scored++;
      } else if (row.err) {
        const hasTexer = fs.existsSync(path.join(TEXER, id + '.png'));
        if (/no texer ref/i.test(row.err) || !hasTexer) {
          rec.error = row.err; noTexer++;            // texer also missing -> genuine gap
        } else {
          rec.ssim = 0; rec.sizeScore = 0; rec.combined = 0; rec.error = row.err; htxFail++;  // htx broke, texer ok -> 0
        }
      }
    }
    done++;
    console.log(`  scored [${done}/${chunks.length} chunks] ok=${scored} htxFail=${htxFail} noTexer=${noTexer} new=${inserted}`);
  }

  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      aggregate(await rerenderChunk(chunk));
    }
  }
  await Promise.all(Array.from({ length: Math.min(opt.jobs, chunks.length) }, worker));

  results.sort((a, b) => (a.combined ?? 1) - (b.combined ?? 1));
  fs.writeFileSync(SSIM_FILE, JSON.stringify(results, null, 2));
  console.log(`\nWrote ssim-results.json (${results.length} rows)`);

  // ── regenerate manifest ──
  try { execSync('node comparison/generate-manifest.js', { cwd: ROOT, stdio: 'inherit' }); }
  catch (e) { console.error('manifest regen failed:', e.message); }

  const summary = { ts: new Date().toISOString(), unionCount: finalIds.length, unexcluded,
    refetch: opt.refetch, compileErrors, refetchFail, genuineCompileErrors, scored, htxFail, noTexer, inserted };
  fs.writeFileSync(LOG, JSON.stringify(summary, null, 2));
  console.log('\n== DONE ==');
  console.log(JSON.stringify({ scored, htxFail, noTexer, inserted, compileErrors: compileErrors.length, unexcluded: unexcluded.length }));
})();
