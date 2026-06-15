'use strict';
/**
 * _refetch_from_list.js
 *
 * Refetch TeXeR PNGs for every id in comparison/_refetch_ids.txt, using up to
 * MAX_WORKERS parallel refetch-single.py processes. After each successful
 * refetch, the new PNG is also copied into the corpus backup so the backup
 * stays in sync (per the user's request).
 *
 * Usage: node comparison/_refetch_from_list.js [--workers 4]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const IDS_FILE = path.join(__dirname, '_refetch_ids.txt');
const TEXER_DIR = path.join(__dirname, 'texer_pngs');
const BACKUP_DIR = path.join(ROOT, '..', 'hitexer-corpus-backup', '20260612-143807', 'texer_pngs');
const PROGRESS = path.join(__dirname, '_refetch_progress.json');
const SUMMARY = path.join(__dirname, '_refetch_summary.json');

let MAX_WORKERS = 4;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--workers') MAX_WORKERS = parseInt(process.argv[++i], 10);
}

function fileHash(p) {
  if (!fs.existsSync(p)) return null;
  try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

const ids = fs.readFileSync(IDS_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const beforeHashes = {};
for (const id of ids) beforeHashes[id] = fileHash(path.join(TEXER_DIR, `${id}.png`));

console.log(`Refetching ${ids.length} diagrams with ${MAX_WORKERS} workers`);
console.log(`Backup dir: ${BACKUP_DIR}`);
if (!fs.existsSync(BACKUP_DIR)) { console.error('BACKUP DIR MISSING — aborting'); process.exit(1); }

let queueIdx = 0, ok = 0, fail = 0, changed = 0, backedUp = 0;
const activeProcs = new Set();
const perId = {};
const failures = [];
const startedAt = Date.now();

function writeProgress() {
  const done = ok + fail;
  fs.writeFileSync(PROGRESS, JSON.stringify({
    total: ids.length, done, ok, fail, changed, backedUp,
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    failures: failures.slice(-20),
  }, null, 2));
}

function startNext() {
  while (activeProcs.size < MAX_WORKERS && queueIdx < ids.length) {
    const id = ids[queueIdx++];
    const proc = spawn('python', ['comparison/refetch-single.py', id], { cwd: ROOT, windowsHide: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    activeProcs.add(proc);
    proc.on('close', () => {
      activeProcs.delete(proc);
      let res = {};
      try { res = JSON.parse(stdout.trim() || '{}'); } catch {}
      const total = ok + fail + 1;
      if (res.ok) {
        ok++;
        const outPath = path.join(TEXER_DIR, `${id}.png`);
        const newHash = fileHash(outPath);
        const didChange = newHash !== beforeHashes[id];
        if (didChange) changed++;
        // copy to backup (always, so backup matches current refetched ref)
        try { fs.copyFileSync(outPath, path.join(BACKUP_DIR, `${id}.png`)); backedUp++; }
        catch (e) { /* ignore */ }
        perId[id] = { ok: true, changed: didChange };
        process.stdout.write(`[${total}/${ids.length}] ${id}: ok${didChange ? ' CHANGED' : ' same'}\n`);
      } else {
        fail++;
        const err = (res.error || 'unknown').slice(0, 120);
        perId[id] = { ok: false, error: err };
        failures.push({ id, err });
        process.stdout.write(`[${total}/${ids.length}] ${id}: FAIL - ${err}\n`);
      }
      if (total % 10 === 0) writeProgress();
      startNext();
    });
  }
}

startNext();
const poll = setInterval(() => {
  if (activeProcs.size === 0 && queueIdx >= ids.length) {
    clearInterval(poll);
    writeProgress();
    fs.writeFileSync(SUMMARY, JSON.stringify({
      finishedAt: new Date().toISOString(), total: ids.length, ok, fail, changed, backedUp,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000), perId,
    }, null, 2));
    console.log(`\n=== DONE === ok=${ok} fail=${fail} changed=${changed} backedUp=${backedUp} in ${Math.round((Date.now()-startedAt)/1000)}s`);
  }
}, 300);
