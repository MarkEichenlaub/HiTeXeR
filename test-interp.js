// Test asy-interp.js against a directory of .asy files using Node.js
// Usage: node test-interp.js [path-to-asy-sources]
'use strict';

const fs = require('fs');
const path = require('path');

// Provide a minimal `window` so asy-interp.js can attach its API
global.window = {};

// Load the interpreter
require('./asy-interp.js');
const AsyInterp = window.AsyInterp;

const srcDir = process.argv[2] || path.join(__dirname, '..', 'dynalist_aops_sync', 'asy_sources');

// Recursively find all .asy files
function findAsy(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findAsy(full));
    else if (entry.name.endsWith('.asy')) results.push(full);
  }
  return results;
}

const files = findAsy(srcDir);
let canInterpretCount = 0;
let renderOk = 0;
let renderFail = 0;
let skipped = 0;
const errors = {};  // errorMessage -> { count, examples[] }

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  // Wrap in [asy]...[/asy] if not already wrapped
  const code = raw.includes('[asy]') ? raw : `[asy]\n${raw}\n[/asy]`;

  if (!AsyInterp.canInterpret(code)) {
    skipped++;
    continue;
  }
  canInterpretCount++;

  try {
    AsyInterp.render(code, { containerW: 500, containerH: 400 });
    renderOk++;
  } catch (e) {
    renderFail++;
    // Bucket errors by message (first line only)
    const msg = (e.message || String(e)).split('\n')[0].substring(0, 120);
    if (!errors[msg]) errors[msg] = { count: 0, examples: [] };
    errors[msg].count++;
    if (errors[msg].examples.length < 3) {
      errors[msg].examples.push(path.relative(srcDir, file));
    }
  }
}

console.log(`\n=== Results ===`);
console.log(`Total .asy files:    ${files.length}`);
console.log(`Skipped (canInterpret=false): ${skipped}`);
console.log(`Attempted:           ${canInterpretCount}`);
console.log(`Rendered OK:         ${renderOk}`);
console.log(`Render failed:       ${renderFail}`);
console.log(`Success rate (of attempted): ${canInterpretCount ? (100 * renderOk / canInterpretCount).toFixed(1) : 0}%`);
console.log(`Success rate (of total):     ${files.length ? (100 * renderOk / files.length).toFixed(1) : 0}%`);

if (Object.keys(errors).length > 0) {
  // Sort by frequency
  const sorted = Object.entries(errors).sort((a, b) => b[1].count - a[1].count);
  console.log(`\n=== Top errors (${sorted.length} distinct) ===`);
  for (const [msg, info] of sorted.slice(0, 25)) {
    console.log(`\n  [${info.count}x] ${msg}`);
    for (const ex of info.examples) console.log(`       e.g. ${ex}`);
  }
}
