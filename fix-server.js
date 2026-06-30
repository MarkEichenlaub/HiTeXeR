'use strict';
// fix-server.js — local helper that the comparator "Fix" button calls.
// Receives the per-diagram prompt, writes it to a file, then opens a new
// Windows Terminal tab running:  claude --dangerously-skip-permissions <prompt>
//
// Also serves static files so the comparator can be loaded directly from
// http://localhost:7842/comparison/blink.html — guaranteeing the server is
// already running when Fix / Re-fetch buttons are clicked.
//
// Usage: node fix-server.js
// Listens on http://localhost:7842

const http = require('http');
const { spawn, spawnSync, execSync } = require('child_process');
const { generate: generateFixHistory } = require('./auto-fix/generate-fix-history.js');
const epsCache = require('./eps-cache');
const fs   = require('fs');
const path = require('path');

const PORT = 7842;
const ROOT = path.resolve(__dirname);
const RUN_LOOP_PID_FILE    = path.join(ROOT, 'auto-fix', '.run-loop-pid');
const ENQUEUE_HISTORY_PATH = path.join(ROOT, 'auto-fix', 'enqueue-history.jsonl');
const FIX_SNAPSHOTS_DIR    = path.join(ROOT, 'auto-fix', 'fix-snapshots');
const DROPLIST_PATH        = path.join(ROOT, 'auto-fix', 'droplist.json');
const EXCLUDE_LOG_PATH     = path.join(ROOT, 'auto-fix', 'exclude-history.jsonl');
const REJECTED_EDITS_DIR   = path.join(ROOT, 'auto-fix', 'rejected-edits');
const REJECTED_EDITS_LOG   = path.join(ROOT, 'auto-fix', 'rejected-edits.jsonl');

function readDroplist() {
  try { return JSON.parse(fs.readFileSync(DROPLIST_PATH, 'utf8')); } catch { return []; }
}
function writeDroplist(ids) {
  fs.writeFileSync(DROPLIST_PATH, JSON.stringify(ids, null, 2));
}
function logExclude(id) {
  // Append-only exclude log — survives droplist.json loss; used to reconstruct it.
  const entry = JSON.stringify({ ts: new Date().toISOString(), id, snapshot: readDroplist() });
  try { fs.appendFileSync(EXCLUDE_LOG_PATH, entry + '\n'); } catch {}
}

// Returns true if a run-loop process is currently live.
function isRunLoopRunning() {
  try {
    const pid = parseInt(fs.readFileSync(RUN_LOOP_PID_FILE, 'utf8'), 10);
    if (!pid || isNaN(pid)) return false;
    process.kill(pid, 0);  // throws if process doesn't exist
    return true;
  } catch {
    return false;
  }
}

// Launch run-loop headlessly as a background child process.
// Logs to auto-fix/run-loop.log; processes the fix queue then stops (it does
// NOT run persistently / auto-select by SSIM). Full pipeline recompute still
// runs every 5 commits while the queue is being drained.
function launchRunLoop() {
  const logPath = path.join(ROOT, 'auto-fix', 'run-loop.log');
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [
    path.join('auto-fix', 'run-loop.js'),
    '--queue-only', '--full-pipeline-every', '5',
  ], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();
  fs.close(out, () => {});
  console.log('[fix-server] launched run-loop headlessly (log: auto-fix/run-loop.log)');
}

// Write the STOP sentinel and kill the process by PID.
function stopRunLoop() {
  const stopPath = path.join(ROOT, 'auto-fix', 'STOP');
  try { fs.writeFileSync(stopPath, ''); } catch {}
  try {
    const pid = parseInt(fs.readFileSync(RUN_LOOP_PID_FILE, 'utf8'), 10);
    if (pid && !isNaN(pid)) { process.kill(pid); return true; }
  } catch {}
  return false;
}

// Regenerate the blink manifest (synchronous). Callers that touch many ids
// should call this ONCE at the end rather than per-id.
function regenManifest() {
  try {
    execSync('node comparison/generate-manifest.js', { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.error('[fix-server] Manifest regen warning:', e.message);
  }
}

// Re-fetch a single diagram's TeXeR PNG via the Python helper. cb(err, result).
function refetchSingle(id, cb) {
  const py = spawn('python', [
    path.join(ROOT, 'comparison', 'refetch-single.py'), id,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  py.stdout.on('data', d => { stdout += d; });
  py.stderr.on('data', d => { stderr += d; });
  py.on('close', (code) => {
    if (code === 0) {
      let result;
      try { result = JSON.parse(stdout.trim()); } catch (_) { result = { ok: true }; }
      cb(null, result);
    } else {
      cb(new Error((stderr.trim() || stdout.trim() || `exit code ${code}`).substring(0, 500)), null);
    }
  });
}

// Re-render a single diagram through HiTeXeR and rescore it against TeXeR,
// patching comparison/ssim-results.json in place. Does NOT regenerate the
// manifest — the caller decides when (so batch callers regen once). Invokes
// cb(err, row) where row is the per-id {id, ssim, sizeScore, combined} object.
function rerenderAndScore(id, cb) {
  const node = spawn(process.execPath, [
    path.join(ROOT, 'auto-fix', 'render-and-score.js'),
  ], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });

  node.stdin.write(id + '\n');
  node.stdin.end();

  let stdout = '', stderr = '';
  node.stdout.on('data', d => { stdout += d; });
  node.stderr.on('data', d => { stderr += d; });

  node.on('close', (code) => {
    // render-and-score.js exits 1 on a "regression"; we still want the row.
    let row = null;
    for (const line of stdout.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        if (obj.id === id && obj.ssim != null) { row = obj; break; }
        if (obj.id === id && obj.err)          { row = obj; break; }
      } catch {}
    }

    if (!row) {
      const errMsg = (stderr.trim() || stdout.trim() || `exit code ${code}`).substring(0, 500);
      cb(new Error(errMsg), null);
      return;
    }

    // Patch ssim-results.json in place.
    const ssimPath = path.join(ROOT, 'comparison', 'ssim-results.json');
    if (row.ssim != null && fs.existsSync(ssimPath)) {
      try {
        const results = JSON.parse(fs.readFileSync(ssimPath, 'utf8'));
        const existing = results.find(r => r.id === id);
        if (existing) {
          existing.ssim      = row.ssim;
          existing.sizeScore = row.sizeScore;
          existing.combined  = row.combined;
          if (row.combined != null && row.combined >= 0) delete existing.error;
        } else {
          results.push({ id, ssim: row.ssim, sizeScore: row.sizeScore, combined: row.combined });
        }
        results.sort((a, b) => a.combined - b.combined);
        fs.writeFileSync(ssimPath, JSON.stringify(results, null, 2));
      } catch (e) {
        console.error('[fix-server] ssim-results.json update warning:', e.message);
      }
    }

    cb(null, row);
  });
}

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.asy':  'text/plain',
  '.patch':'text/plain',
};

const server = http.createServer((req, res) => {
  // CORS — the browser page is a file:// or localhost URL
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    const status = {};
    status.runLoopRunning = isRunLoopRunning();

    // Current sub-agent phase (written by run-loop.js)
    try {
      status.current = JSON.parse(fs.readFileSync(path.join(ROOT, 'auto-fix', '.status.json'), 'utf8'));
    } catch { status.current = null; }

    // Pending queue
    try {
      const q = JSON.parse(fs.readFileSync(path.join(ROOT, 'auto-fix', 'queue.json'), 'utf8'));
      status.queue = Array.isArray(q) ? q : [];
    } catch { status.queue = []; }

    // Most recent attempt record
    try {
      const lines = fs.readFileSync(path.join(ROOT, 'auto-fix', 'attempts.jsonl'), 'utf8')
        .split(/\r?\n/).filter(Boolean);
      status.lastAttempt = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    } catch { status.lastAttempt = null; }

    // Most recent telemetry record (cost, turns)
    try {
      const lines = fs.readFileSync(path.join(ROOT, 'auto-fix', 'telemetry.jsonl'), 'utf8')
        .split(/\r?\n/).filter(Boolean);
      status.lastTelemetry = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    } catch { status.lastTelemetry = null; }

    // Manifest mtime — blink.html reloads the grid when this changes
    try {
      status.manifestMtime = fs.statSync(path.join(ROOT, 'comparison', 'blink-manifest.json')).mtimeMs;
    } catch { status.manifestMtime = 0; }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  if (req.method === 'POST' && req.url === '/stop-loop') {
    const stopped = stopRunLoop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, stopped }));
    return;
  }

  if (req.method === 'POST' && req.url === '/start-loop') {
    let q = [];
    try { q = JSON.parse(fs.readFileSync(path.join(ROOT, 'auto-fix', 'queue.json'), 'utf8')); } catch {}
    if (!Array.isArray(q) || q.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Queue is empty' }));
      return;
    }
    if (isRunLoopRunning()) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, already: true }));
      return;
    }
    try { fs.unlinkSync(path.join(ROOT, 'auto-fix', 'STOP')); } catch {}
    launchRunLoop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/convert-eps') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { paths } = JSON.parse(body);
        if (!Array.isArray(paths) || paths.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or empty paths array' }));
          return;
        }
        const images = epsCache.getImageCache(paths);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ images }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err && err.message || err) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/refetch') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');

        console.log(`[fix-server] Re-fetching TeXeR PNG for diagram ${id}...`);

        // Spawn Python script to re-render this single diagram
        const py = spawn('python', [
          path.join(ROOT, 'comparison', 'refetch-single.py'),
          id,
        ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '', stderr = '';
        py.stdout.on('data', d => { stdout += d; });
        py.stderr.on('data', d => { stderr += d; });

        py.on('close', (code) => {
          if (code === 0) {
            let result;
            try { result = JSON.parse(stdout.trim()); } catch (_) { result = { ok: true }; }

            // Chain: a fresh TeXeR PNG is only meaningful once HiTeXeR is
            // re-rendered and re-scored against it. Do that, then regen the
            // manifest ONCE so the comparator picks up both the new PNG and
            // the new SSIM together.
            rerenderAndScore(id, (rerErr, row) => {
              regenManifest();
              if (rerErr) {
                console.error(`[fix-server] Re-fetch ok but re-render failed for ${id}:`, rerErr.message);
                // The refetch itself succeeded — surface that, but flag the score gap.
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id, result, rerenderError: rerErr.message }));
                return;
              }
              console.log(`[fix-server] Re-fetch + re-score done for ${id}:`, row);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, id, result, row }));
            });
          } else {
            let errMsg = stderr.trim() || stdout.trim() || `exit code ${code}`;
            console.error(`[fix-server] Re-fetch failed for ${id}:`, errMsg);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: errMsg.substring(0, 500) }));
          }
        });
      } catch (e) {
        console.error('[fix-server] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/rerender') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');

        console.log(`[fix-server] Re-rendering HiTeXeR for diagram ${id}...`);

        rerenderAndScore(id, (err, row) => {
          if (err) {
            console.error(`[fix-server] Re-render failed for ${id}:`, err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }
          // Regenerate manifest so hasHtx / hasSvg flags are fresh.
          regenManifest();
          console.log(`[fix-server] Re-render done for ${id}:`, row);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id, row }));
        });
      } catch (e) {
        console.error('[fix-server] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Bulk actions on a selected set of ids ─────────────
  // Body: { ids: ["123", ...] }. All process the list serially (refetch must
  // be serial to avoid TeXeR rate-limits) and regen the manifest ONCE at the
  // end. Respond with a per-id summary so the client can report results.
  if (req.method === 'POST' && (req.url === '/refetch-batch' || req.url === '/rerender-batch')) {
    const withRefetch = req.url === '/refetch-batch';
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let ids;
      try {
        ids = JSON.parse(body).ids;
        if (!Array.isArray(ids) || !ids.length) throw new Error('Missing ids[]');
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
        return;
      }
      console.log(`[fix-server] Bulk ${withRefetch ? 'refetch+' : ''}rerender for ${ids.length} ids...`);
      const results = [];
      let i = 0;
      const step = () => {
        if (i >= ids.length) {
          regenManifest();
          const okCount = results.filter(r => r.ok).length;
          console.log(`[fix-server] Bulk done: ${okCount}/${ids.length} ok`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, total: ids.length, okCount, results }));
          return;
        }
        const id = ids[i++];
        const doScore = () => rerenderAndScore(id, (err, row) => {
          results.push(err ? { id, ok: false, error: err.message } : { id, ok: true, row });
          step();
        });
        if (withRefetch) {
          refetchSingle(id, (err) => {
            if (err) { results.push({ id, ok: false, error: 'refetch: ' + err.message }); step(); return; }
            doScore();
          });
        } else {
          doScore();
        }
      };
      step();
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/exclude-batch') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const ids = JSON.parse(body).ids;
        if (!Array.isArray(ids) || !ids.length) throw new Error('Missing ids[]');
        const drop = readDroplist();
        const dropSet = new Set(drop);
        for (const id of ids) {
          if (!dropSet.has(id)) { drop.push(id); dropSet.add(id); logExclude(id); }
        }
        writeDroplist(drop);
        // Remove all from the queue in one pass.
        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        try {
          const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
          const idSet = new Set(ids);
          fs.writeFileSync(queuePath, JSON.stringify(q.filter(item => !idSet.has(item.id)), null, 2));
        } catch {}
        regenManifest();
        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }
        console.log(`[fix-server] Bulk-excluded ${ids.length} ids`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: ids.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/enqueue-batch') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const ids = parsed.ids;
        const description = parsed.description || '';
        if (!Array.isArray(ids) || !ids.length) throw new Error('Missing ids[]');

        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        let queue = [];
        if (fs.existsSync(queuePath)) {
          try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch {}
        }
        const idSet = new Set(ids);
        queue = queue.filter(item => !idSet.has(item.id));
        for (const id of ids) {
          const enqueuedAt = new Date().toISOString();
          const enqueueId  = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          queue.push({ id, description, addedAt: enqueuedAt });
          fs.appendFileSync(ENQUEUE_HISTORY_PATH, JSON.stringify({ enqueueId, id, description, enqueuedAt }) + '\n');
          const srcPng = path.join(ROOT, 'comparison', 'htx_pngs', id.padStart(5, '0') + '.png');
          const dstPng = path.join(FIX_SNAPSHOTS_DIR, enqueueId + '-before.png');
          if (fs.existsSync(srcPng)) { try { fs.copyFileSync(srcPng, dstPng); } catch {} }
        }
        fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }
        console.log(`[fix-server] Bulk-enqueued ${ids.length} ids (queue length: ${queue.length})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: ids.length, queueLength: queue.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/enqueue') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, description } = JSON.parse(body);
        if (!id) throw new Error('Missing id');

        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        let queue = [];
        if (fs.existsSync(queuePath)) {
          try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch {}
        }
        // Replace any existing entry for this id so re-queuing updates the description
        queue = queue.filter(item => item.id !== id);
        const enqueuedAt = new Date().toISOString();
        const enqueueId  = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        queue.push({ id, description: description || '', addedAt: enqueuedAt });
        fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));

        // Persist history entry so fix-history.html can show it later.
        const historyEntry = { enqueueId, id, description: description || '', enqueuedAt };
        fs.appendFileSync(ENQUEUE_HISTORY_PATH, JSON.stringify(historyEntry) + '\n');

        // Snapshot the current HiTeXeR render as a "before" image.
        const srcPng = path.join(ROOT, 'comparison', 'htx_pngs', id.padStart(5, '0') + '.png');
        const dstPng = path.join(FIX_SNAPSHOTS_DIR, enqueueId + '-before.png');
        if (fs.existsSync(srcPng)) {
          try { fs.copyFileSync(srcPng, dstPng); } catch {}
        }

        console.log(`[fix-server] Enqueued diagram ${id} (queue length: ${queue.length})`);

        // Regenerate static fix-history page so it's always up to date.
        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }

        if (isRunLoopRunning()) {
          console.log('[fix-server] run-loop already running; item added to queue');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, queueLength: queue.length }));
      } catch (e) {
        console.error('[fix-server] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/skip') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');

        // Add to skiplist
        const skiplistPath = path.join(ROOT, 'auto-fix', 'skiplist.json');
        let skiplist = { ids: [] };
        if (fs.existsSync(skiplistPath)) {
          try { skiplist = JSON.parse(fs.readFileSync(skiplistPath, 'utf8')); } catch {}
        }
        if (!Array.isArray(skiplist.ids)) skiplist.ids = [];
        if (!skiplist.ids.includes(id)) {
          skiplist.ids.push(id);
          fs.writeFileSync(skiplistPath, JSON.stringify(skiplist, null, 2));
        }

        // Also remove from queue if present
        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        if (fs.existsSync(queuePath)) {
          try {
            const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
            const filtered = queue.filter(item => item.id !== id);
            if (filtered.length !== queue.length) {
              fs.writeFileSync(queuePath, JSON.stringify(filtered, null, 2));
            }
          } catch {}
        }

        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }
        console.log(`[fix-server] Skipped diagram ${id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        console.error('[fix-server] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/exclude') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');
        const ids = readDroplist();
        if (!ids.includes(id)) { ids.push(id); writeDroplist(ids); logExclude(id); }
        // Remove from queue too
        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        try {
          const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
          fs.writeFileSync(queuePath, JSON.stringify(q.filter(item => item.id !== id), null, 2));
        } catch {}
        try { spawnSync(process.execPath, ['comparison/generate-manifest.js'], { cwd: ROOT, stdio: 'pipe' }); } catch {}
        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }
        console.log(`[fix-server] Excluded diagram ${id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/undrop') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');
        writeDroplist(readDroplist().filter(x => x !== id));
        try { spawnSync(process.execPath, ['comparison/generate-manifest.js'], { cwd: ROOT, stdio: 'pipe' }); } catch {}
        console.log(`[fix-server] Restored diagram ${id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/dequeue') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error('Missing id');
        const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
        let queue = [];
        try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch {}
        const filtered = queue.filter(item => item.id !== id);
        fs.writeFileSync(queuePath, JSON.stringify(filtered, null, 2));
        try { generateFixHistory(); } catch (e) { console.error('[fix-server] fix-history gen failed:', e.message); }
        console.log(`[fix-server] Dequeued diagram ${id} (queue length: ${filtered.length})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, queueLength: filtered.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/fix') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, prompt } = JSON.parse(body);
        if (!id || !prompt) throw new Error('Missing id or prompt');

        // Write prompt to a file so we can pass it to claude cleanly
        const promptFile = path.join(ROOT, '_fix_prompt.txt');
        fs.writeFileSync(promptFile, prompt, 'utf8');

        // PowerShell command: read file → pass as initial message to claude
        // Using single-quoted path (no variable expansion) for safety.
        const promptFileSq = promptFile.replace(/'/g, "''"); // PS single-quote escape
        const psCmd = [
          `$p = Get-Content -Path '${promptFileSq}' -Raw -Encoding UTF8`,
          `claude --dangerously-skip-permissions $p`,
        ].join('; ');

        // Open a new Windows Terminal tab in the hitexer directory
        const child = spawn('wt', [
          '-w', '0',
          'new-tab',
          '-d', ROOT,
          '--',
          'powershell', '-NoExit', '-Command', psCmd,
        ], { detached: true, stdio: 'ignore' });
        child.unref();

        console.log(`[fix-server] Launched claude for diagram ${id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        console.error('[fix-server] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Rejected edits (canary-failure review) ────────────
  // List edits the auto-fix loop tried and reverted, newest first. Each record
  // carries the patch filename + snapshot filenames (served statically from
  // /auto-fix/rejected-edits/…), so the review page can render the 4-up grids.
  if (req.method === 'GET' && req.url === '/rejected-edits') {
    try {
      const lines = fs.existsSync(REJECTED_EDITS_LOG)
        ? fs.readFileSync(REJECTED_EDITS_LOG, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      // Annotate with which artifacts actually exist on disk.
      for (const r of records) {
        r.patchExists = !!(r.patchFile && fs.existsSync(path.join(REJECTED_EDITS_DIR, r.patchFile)));
        r.targetAfterExists = !!(r.targetAfterSnapshot && fs.existsSync(path.join(REJECTED_EDITS_DIR, r.targetAfterSnapshot)));
        // before-snapshot lives in fix-snapshots, keyed by enqueueId
        r.targetBeforeFile = r.targetBeforeEnqueueId
          ? ('auto-fix/fix-snapshots/' + r.targetBeforeEnqueueId + '-before.png') : null;
        r.targetBeforeExists = !!(r.targetBeforeEnqueueId &&
          fs.existsSync(path.join(FIX_SNAPSHOTS_DIR, r.targetBeforeEnqueueId + '-before.png')));
      }
      records.reverse();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(records));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Accept a rejected edit: re-apply its saved patch onto the current code.
  // git apply --3way merges cleanly when the surrounding code hasn't moved; on
  // conflict it leaves conflict markers and we hand off to a Sonnet session in a
  // new terminal tab to resolve, re-verify, bump the version and recompute.
  if (req.method === 'POST' && req.url === '/accept-rejected') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { rejectId } = JSON.parse(body);
        if (!rejectId) throw new Error('Missing rejectId');
        const lines = fs.existsSync(REJECTED_EDITS_LOG)
          ? fs.readFileSync(REJECTED_EDITS_LOG, 'utf8').trim().split('\n').filter(Boolean)
          : [];
        const rec = lines.map(l => { try { return JSON.parse(l); } catch { return null; } })
                         .filter(Boolean).find(r => r.rejectId === rejectId);
        if (!rec) throw new Error('Unknown rejectId ' + rejectId);
        if (!rec.patchFile) throw new Error('No patch saved for this edit');
        const patchPath = path.join(REJECTED_EDITS_DIR, rec.patchFile);
        if (!fs.existsSync(patchPath)) throw new Error('Patch file missing: ' + rec.patchFile);

        // Try a clean 3-way apply first (leaves changes staged for review).
        const apply = spawnSync('git', ['apply', '--3way', '--index', patchPath],
          { cwd: ROOT, encoding: 'utf8' });

        if (apply.status === 0) {
          console.log(`[fix-server] Accepted rejected edit ${rejectId} — applied cleanly (staged)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, rejectId, mode: 'clean',
            message: 'Patch applied and staged. Review with `git diff --staged`, then re-render and commit.' }));
          return;
        }

        // Conflict — hand off to a Sonnet-assisted resolution session.
        const conflictMsg = (apply.stderr || apply.stdout || '').trim().substring(0, 500);
        console.log(`[fix-server] Edit ${rejectId} did not apply cleanly; launching Sonnet resolver`);
        const prompt = [
          'A previously auto-rejected HiTeXeR fix needs to be re-applied to the current code and the merge conflicts resolved.',
          '',
          'Saved patch: ' + patchPath,
          'It was originally generated against commit ' + (rec.baseCommit || '(unknown)') + ' but the code has since moved, so `git apply --3way` reported conflicts:',
          conflictMsg,
          '',
          'Target diagram: ' + rec.targetId + (rec.description ? ' — "' + rec.description + '"' : ''),
          'Original reject reason: ' + rec.reason,
          (rec.verifierDefects && rec.verifierDefects.length ? 'Verifier defects: ' + rec.verifierDefects.join('; ') : ''),
          (rec.regressedCanaries && rec.regressedCanaries.length
            ? 'It originally regressed these canaries (do NOT re-regress them): ' + rec.regressedCanaries.map(c => c.id).join(', ') : ''),
          '',
          'Steps:',
          '1. Inspect the patch: git apply --3way ' + patchPath + ' (resolve any <<<< conflict markers in asy-interp.js).',
          '2. Re-render: node render-hitexer.js comparison/asy_src/' + String(rec.targetId).padStart(5,'0') + '.asy and compare to comparison/texer_pngs/' + String(rec.targetId).padStart(5,'0') + '.png',
          '3. Run the canary guard: node auto-fix/render-and-score.js --canary — ensure no canary drops > 0.03.',
          '4. If good, bump the version in index.html and run: node recompute-htx.js render-htx rasterize ssim html',
          '5. Commit the change.',
        ].join('\n');
        const promptFile = path.join(ROOT, '_accept_prompt.txt');
        fs.writeFileSync(promptFile, prompt, 'utf8');
        const promptFileSq = promptFile.replace(/'/g, "''");
        const psCmd = [
          `$p = Get-Content -Path '${promptFileSq}' -Raw -Encoding UTF8`,
          `claude --dangerously-skip-permissions --model claude-sonnet-5 $p`,
        ].join('; ');
        const child = spawn('wt', ['-w', '0', 'new-tab', '-d', ROOT, '--',
          'powershell', '-NoExit', '-Command', psCmd], { detached: true, stdio: 'ignore' });
        child.unref();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rejectId, mode: 'conflict',
          message: 'Patch did not apply cleanly. Launched a Sonnet session to resolve the conflict.' }));
      } catch (e) {
        console.error('[fix-server] accept-rejected error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Dismiss a rejected edit from the review list (removes its log line; leaves
  // patch/snapshot files in place in case they're wanted later).
  if (req.method === 'POST' && req.url === '/dismiss-rejected') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { rejectId } = JSON.parse(body);
        if (!rejectId) throw new Error('Missing rejectId');
        const lines = fs.existsSync(REJECTED_EDITS_LOG)
          ? fs.readFileSync(REJECTED_EDITS_LOG, 'utf8').trim().split('\n').filter(Boolean)
          : [];
        const kept = lines.filter(l => { try { return JSON.parse(l).rejectId !== rejectId; } catch { return true; } });
        fs.writeFileSync(REJECTED_EDITS_LOG, kept.length ? kept.join('\n') + '\n' : '');
        console.log(`[fix-server] Dismissed rejected edit ${rejectId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rejectId }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Fix history ───────────────────────────────────────
  if (req.method === 'GET' && req.url === '/fix-history') {
    try {
      // Read enqueue history
      const enqueueLines = fs.existsSync(ENQUEUE_HISTORY_PATH)
        ? fs.readFileSync(ENQUEUE_HISTORY_PATH, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const enqueues = enqueueLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

      // Read all attempts, group by id
      const ATTEMPTS_PATH = path.join(ROOT, 'auto-fix', 'attempts.jsonl');
      const attemptLines = fs.existsSync(ATTEMPTS_PATH)
        ? fs.readFileSync(ATTEMPTS_PATH, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const allAttempts = attemptLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

      // Read current queue to flag pending items
      const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
      let currentQueue = [];
      try { currentQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch {}
      const queuedIds = new Set((currentQueue || []).map(q => q.id));

      // For each enqueue, find the earliest attempt with same id after enqueuedAt
      const items = enqueues.map(eq => {
        const matching = allAttempts
          .filter(a => a.id === eq.id && a.ts >= eq.enqueuedAt)
          .sort((a, b) => a.ts < b.ts ? -1 : 1);
        // Use the last of the matching attempts (final verdict after retries)
        const attempt = matching.length ? matching[matching.length - 1] : null;
        const hasBeforeSnapshot = fs.existsSync(path.join(FIX_SNAPSHOTS_DIR, eq.enqueueId + '-before.png'));
        return {
          enqueueId: eq.enqueueId,
          id: eq.id,
          description: eq.description,
          enqueuedAt: eq.enqueuedAt,
          hasBeforeSnapshot,
          queued: queuedIds.has(eq.id),
          attempt,
        };
      }).reverse(); // newest first

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(items));
    } catch (e) {
      console.error('[fix-server] fix-history error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Static file serving ───────────────────────────────
  if (req.method === 'GET') {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') { urlPath = '/comparison/blink.html'; }
    const filePath = path.join(ROOT, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden\n');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end('Not found\n');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      // Never cache the interpreter/app code or data (asy-interp.js, katex-svg.js,
      // the HTML pages, manifests/results, glyph table). The browser otherwise
      // serves a stale asy-interp.js after edits — so a fix passes node renders
      // but is invisible in the comparator/editor (the bug that masked the whole
      // 00133 session). `no-store` forces a fresh fetch every load; this removes
      // the need for ?v= cache-busters in the HTML. Large static corpus images
      // (.png/.jpg) keep the default heuristic cache so the comparator stays fast.
      const headers = { 'Content-Type': mime };
      if (ext === '.js' || ext === '.html' || ext === '.json' || ext === '.css') {
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      res.writeHead(200, headers);
      const rs = fs.createReadStream(filePath);
      rs.on('error', err => { console.error('[fix-server] Read error:', err.message); res.destroy(); });
      res.on('error', () => { rs.destroy(); });
      rs.pipe(res);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found\n');
});

process.on('uncaughtException', err => { console.error('[fix-server] Uncaught exception:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('[fix-server] Unhandled rejection:', reason); });

fs.mkdirSync(FIX_SNAPSHOTS_DIR, { recursive: true });

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fix-server listening on http://localhost:${PORT}`);
  console.log(`Comparator: http://localhost:${PORT}/comparison/blink.html`);
  console.log(`Hitexer directory: ${ROOT}`);
  console.log('Click "Fix" on any comparator card to launch a claude session.');
  console.log('Press Ctrl+C to stop.\n');

  // If droplist.json is missing, reconstruct it from exclude-history.jsonl.
  if (!fs.existsSync(DROPLIST_PATH) && fs.existsSync(EXCLUDE_LOG_PATH)) {
    try {
      const lines = fs.readFileSync(EXCLUDE_LOG_PATH, 'utf8').split('\n').filter(Boolean);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]);
        if (Array.isArray(last.snapshot)) {
          writeDroplist(last.snapshot);
          console.log(`[fix-server] droplist.json reconstructed from exclude-history (${last.snapshot.length} entries)`);
        }
      }
    } catch (e) {
      console.error('[fix-server] droplist reconstruction failed:', e.message);
    }
  }

  // Regenerate blink-manifest.json on startup so excluded diagrams (droplist.json)
  // are reflected even if blink-manifest.json was reset by git reset --hard.
  try {
    spawnSync(process.execPath, ['comparison/generate-manifest.js'], { cwd: ROOT, stdio: 'pipe' });
    console.log('[fix-server] manifest regenerated from droplist on startup');
  } catch (e) {
    console.error('[fix-server] startup manifest regeneration failed:', e.message);
  }

  // Regenerate the static fix-history page on startup so its embedded fallback
  // reflects the current queue even if the loop hasn't run since the last queue
  // change. (The page also re-syncs against /status live when opened.)
  try {
    generateFixHistory();
    console.log('[fix-server] fix-history regenerated on startup');
  } catch (e) {
    console.error('[fix-server] startup fix-history regeneration failed:', e.message);
  }

  // Auto-start disabled: user must click the green dot in the comparator to start the loop.
});
