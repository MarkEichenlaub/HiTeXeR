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
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT = 7842;
const ROOT = path.resolve(__dirname);

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
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found\n');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fix-server listening on http://localhost:${PORT}`);
  console.log(`Comparator: http://localhost:${PORT}/comparison/blink.html`);
  console.log(`Hitexer directory: ${ROOT}`);
  console.log('Click "Fix" on any comparator card to launch a claude session.');
  console.log('Press Ctrl+C to stop.\n');
});
