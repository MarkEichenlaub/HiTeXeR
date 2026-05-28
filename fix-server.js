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
const fs   = require('fs');
const path = require('path');

const PORT = 7842;
const ROOT = path.resolve(__dirname);
const RUN_LOOP_PID_FILE    = path.join(ROOT, 'auto-fix', '.run-loop-pid');
const ENQUEUE_HISTORY_PATH = path.join(ROOT, 'auto-fix', 'enqueue-history.jsonl');
const FIX_SNAPSHOTS_DIR    = path.join(ROOT, 'auto-fix', 'fix-snapshots');
const DROPLIST_PATH        = path.join(ROOT, 'auto-fix', 'droplist.json');
const EXCLUDE_LOG_PATH     = path.join(ROOT, 'auto-fix', 'exclude-history.jsonl');

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
// Logs to auto-fix/run-loop.log; runs persistently with full-pipeline every 10 commits.
function launchRunLoop() {
  const logPath = path.join(ROOT, 'auto-fix', 'run-loop.log');
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [
    path.join('auto-fix', 'run-loop.js'),
    '--persistent', '--full-pipeline-every', '10',
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
            // Regenerate the blink manifest so the comparator picks up the new PNG
            try {
              require('child_process').execSync('node comparison/generate-manifest.js', {
                cwd: ROOT, stdio: 'pipe',
              });
            } catch (e) {
              console.error('[fix-server] Manifest regen warning:', e.message);
            }

            let result;
            try { result = JSON.parse(stdout.trim()); } catch (_) { result = { ok: true }; }
            console.log(`[fix-server] Re-fetch done for ${id}:`, result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id, result }));
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

        // Spawn render-and-score.js, feeding the id via stdin
        const node = spawn(process.execPath, [
          path.join(ROOT, 'auto-fix', 'render-and-score.js'),
        ], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });

        node.stdin.write(id + '\n');
        node.stdin.end();

        let stdout = '', stderr = '';
        node.stdout.on('data', d => { stdout += d; });
        node.stderr.on('data', d => { stderr += d; });

        node.on('close', (code) => {
          // Parse per-ID result line. Note: render-and-score.js exits with code 1
          // when it detects a "regression" (SSIM drop beyond threshold). For the
          // interactive Re-render button we WANT to see the new SSIM even if it
          // regressed — surfacing a regression as "Failed" hides the data we
          // need to diagnose. Only treat the subprocess as truly failed when we
          // can't recover a per-id row at all.
          let row = null;
          for (const line of stdout.split('\n')) {
            const s = line.trim();
            if (!s) continue;
            try {
              const obj = JSON.parse(s);
              if (obj.id === id && obj.ssim != null) { row = obj; break; }
              if (obj.id === id && obj.err) { row = obj; break; }
            } catch {}
          }

          if (!row) {
            const errMsg = (stderr.trim() || stdout.trim() || `exit code ${code}`).substring(0, 500);
            console.error(`[fix-server] Re-render failed for ${id}:`, errMsg);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: errMsg }));
            return;
          }

          // Patch ssim-results.json in place
          const ssimPath = path.join(ROOT, 'comparison', 'ssim-results.json');
          if (row && row.ssim != null && fs.existsSync(ssimPath)) {
            try {
              const results = JSON.parse(fs.readFileSync(ssimPath, 'utf8'));
              const existing = results.find(r => r.id === id);
              if (existing) {
                existing.ssim      = row.ssim;
                existing.sizeScore = row.sizeScore;
                existing.combined  = row.combined;
                if (row.combined != null && row.combined >= 0) delete existing.error;
                results.sort((a, b) => a.combined - b.combined);
                fs.writeFileSync(ssimPath, JSON.stringify(results, null, 2));
              }
            } catch (e) {
              console.error('[fix-server] ssim-results.json update warning:', e.message);
            }
          }

          // Regenerate manifest so hasHtx / hasSvg flags are fresh
          try {
            require('child_process').execSync('node comparison/generate-manifest.js', {
              cwd: ROOT, stdio: 'pipe',
            });
          } catch (e) {
            console.error('[fix-server] Manifest regen warning:', e.message);
          }

          console.log(`[fix-server] Re-render done for ${id}:`, row || '(no row)');
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

        // Auto-launch the run-loop if it's not already running.
        if (!isRunLoopRunning()) {
          launchRunLoop();
        } else {
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
      res.writeHead(200, { 'Content-Type': mime });
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

  // If there are already queued items (e.g. left over from a previous session),
  // auto-start the run-loop immediately rather than waiting for the next enqueue.
  try {
    const queuePath = path.join(ROOT, 'auto-fix', 'queue.json');
    const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : [];
    if (Array.isArray(queue) && queue.length > 0 && !isRunLoopRunning()) {
      console.log(`[fix-server] found ${queue.length} item(s) in queue — auto-starting run-loop (5s delay)`);
      setTimeout(launchRunLoop, 5000);
    }
  } catch (e) {
    console.error('[fix-server] startup queue check failed:', e.message);
  }
});
