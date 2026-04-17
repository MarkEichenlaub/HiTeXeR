'use strict';
/**
 * batch-refetch.js
 *
 * Re-fetches TeXeR PNGs for all diagrams with combined SSIM <= threshold,
 * using up to MAX_WORKERS parallel refetch-single.py processes.
 *
 * Usage:
 *   node batch-refetch.js [--threshold 0.5] [--workers 4]
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT      = __dirname;
const SSIM_FILE = path.join(ROOT, 'comparison', 'ssim-results.json');
const TEXER_DIR = path.join(ROOT, 'comparison', 'texer_pngs');

// Parse CLI args
let THRESHOLD = 0.5;
let MAX_WORKERS = 4;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--threshold') THRESHOLD = parseFloat(process.argv[++i]);
  if (process.argv[i] === '--workers')   MAX_WORKERS = parseInt(process.argv[++i], 10);
}

function fileHash(p) {
  if (!fs.existsSync(p)) return null;
  try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

async function main() {
  const results = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf8'));
  const lowIds = results
    .filter(r => typeof r.combined === 'number' && r.combined <= THRESHOLD)
    .map(r => r.id);

  console.log(`Diagrams with combined SSIM <= ${THRESHOLD}: ${lowIds.length}`);
  console.log(`Workers: ${MAX_WORKERS}\n`);

  // Record before-hashes and before-ssim
  const beforeHashes = {};
  const beforeSSIM   = {};
  for (const r of results) {
    if (typeof r.combined === 'number' && r.combined <= THRESHOLD) {
      beforeHashes[r.id] = fileHash(path.join(TEXER_DIR, `${r.id}.png`));
      beforeSSIM[r.id]   = r.combined;
    }
  }

  let queueIdx = 0;
  let ok = 0, fail = 0, changed = 0;
  const activeProcs = new Set();
  const perIdResult = {};  // id -> {ok, changed, error}

  function startNext() {
    while (activeProcs.size < MAX_WORKERS && queueIdx < lowIds.length) {
      const id = lowIds[queueIdx++];
      const proc = spawn('python', ['comparison/refetch-single.py', id], {
        cwd: ROOT,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; });

      activeProcs.add(proc);

      proc.on('close', () => {
        activeProcs.delete(proc);

        let result = {};
        try { result = JSON.parse(stdout.trim() || '{}'); } catch {}

        if (result.ok) {
          ok++;
          const newHash = fileHash(path.join(TEXER_DIR, `${id}.png`));
          const didChange = (newHash !== beforeHashes[id]);
          if (didChange) changed++;
          perIdResult[id] = { ok: true, changed: didChange };
          const total = ok + fail;
          const pct = Math.round(100 * total / lowIds.length);
          process.stdout.write(`[${total}/${lowIds.length} ${pct}%] ${id}: ok${didChange ? ' CHANGED' : ''}\n`);
        } else {
          fail++;
          const err = result.error || 'unknown';
          perIdResult[id] = { ok: false, error: err };
          const total = ok + fail;
          const pct = Math.round(100 * total / lowIds.length);
          process.stdout.write(`[${total}/${lowIds.length} ${pct}%] ${id}: FAIL - ${err.slice(0,80)}\n`);
        }

        startNext();
      });
    }
  }

  // Kick off initial batch
  startNext();

  // Wait until all done
  await new Promise(resolve => {
    const poll = setInterval(() => {
      if (activeProcs.size === 0 && queueIdx >= lowIds.length) {
        clearInterval(poll);
        resolve();
      }
    }, 300);
  });

  console.log(`\n=== Refetch complete ===`);
  console.log(`  Total attempted : ${lowIds.length}`);
  console.log(`  Succeeded       : ${ok}`);
  console.log(`  Failed          : ${fail}`);
  console.log(`  PNGs changed    : ${changed}`);

  // Write per-id results for use by the SSIM recompute step
  const summary = {
    timestamp:  new Date().toISOString(),
    threshold:  THRESHOLD,
    total:      lowIds.length,
    ok,
    fail,
    changed,
    ids:        lowIds,
    perIdResult,
    beforeSSIM,
  };
  const summaryPath = path.join(ROOT, 'refetch-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary saved to refetch-summary.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
