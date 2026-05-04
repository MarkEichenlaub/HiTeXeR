'use strict';
// render-hitexer.js – CLI helper: renders a single .asy file via HiTeXeR
// Usage: node render-hitexer.js <path-to-asy-file>
// Output: SVG string on stdout
// Exit code 1 on failure (error to stderr)

const fs = require('fs');
const path = require('path');

const asyFile = process.argv[2];
if (!asyFile) {
  process.stderr.write('Usage: node render-hitexer.js <path-to-asy-file>\n');
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(asyFile, 'utf8');
} catch (e) {
  process.stderr.write(`Error reading file: ${e.message}\n`);
  process.exit(1);
}

const code = '[asy]\n' + raw + '\n[/asy]';

global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;

if (!A.canInterpret(code)) {
  process.stderr.write('Not interpretable by HiTeXeR\n');
  process.exit(1);
}

// Resolve any AoPS /var/www/cdn/...eps paths via the persistent EPS cache.
// Missing assets are downloaded + converted (Ghostscript) on first use.
let imageCache = {};
try {
  const epsCache = require('./eps-cache');
  imageCache = epsCache.getImageCache(raw);
} catch (e) {
  process.stderr.write(`[render-hitexer] eps-cache unavailable: ${e.message}\n`);
}

try {
  const result = A.render(code, { containerW: 500, containerH: 400, labelOutput: 'svg-native', imageCache });
  // Ensure UTF-8 encoding on Windows
  if (process.stdout.setEncoding) {
    process.stdout.setEncoding('utf8');
  }
  process.stdout.write(result.svg);
} catch (e) {
  process.stderr.write(`Render failed: ${e.message}\n${e.stack || ''}\n`);
  process.exit(1);
}
