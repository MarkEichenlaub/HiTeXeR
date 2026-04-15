'use strict';
// fix-server.js — local helper that the comparator "Fix" button calls.
// Receives the per-diagram prompt, writes it to a file, then opens a new
// Windows Terminal tab running:  claude --dangerously-skip-permissions <prompt>
//
// Usage: node fix-server.js
// Listens on http://localhost:7842

const http = require('http');
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT = 7842;
const ROOT = path.resolve(__dirname);

const server = http.createServer((req, res) => {
  // CORS — the browser page is a file:// or localhost URL
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
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

  res.writeHead(404);
  res.end('Not found\n');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fix-server listening on http://localhost:${PORT}`);
  console.log(`Hitexer directory: ${ROOT}`);
  console.log('Click "Fix" on any comparator card to launch a claude session.');
  console.log('Press Ctrl+C to stop.\n');
});
