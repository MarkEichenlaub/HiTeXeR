'use strict';
// Runs each .asy test in this directory through the HiTeXeR interpreter and
// (when available) a real Asymptote binary, then diffs the write() output.
//
//   node collections-tests/run.js                 # HiTeXeR only, print output
//   node collections-tests/run.js --oracle <asy.exe> [--dir <ASYMPTOTE_DIR>]
//                                                 # also diff vs real asy
//
// The asy 3.11 collections tests need a 3.11+ binary (system 3.05 predates
// the collections library); infinity.asy and oldmap.asy also pass on 3.05.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

process.env.HTX_WRITE = '1';
global.window = {};
global.katex = require('katex');
require(path.join(__dirname, '..', 'asy-interp.js'));

const argv = process.argv.slice(2);
const oracleIdx = argv.indexOf('--oracle');
const oracle = oracleIdx >= 0 ? argv[oracleIdx + 1] : null;
const dirIdx = argv.indexOf('--dir');
const oracleDir = dirIdx >= 0 ? argv[dirIdx + 1] : null;
const only = argv.filter(a => a.endsWith('.asy'));

// asy prints bools/values with trailing spaces and platform-varying nan
// spellings; hashes are salted per-run in real asy. Normalize both sides.
function normalize(text) {
  return text.split(/\r?\n/)
    .map(l => l.replace(/^\[write\] /, '').replace(/\s+$/, ''))
    .map(l => l.replace(/-?nan(\(ind\))?/g, 'nan'))
    .filter(l => l !== '')
    .join('\n');
}

function runHitexer(src) {
  const chunks = [];
  const origWrite = process.stderr.write;
  process.stderr.write = (s) => { chunks.push(String(s)); return true; };
  try {
    global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', {
      containerW: 800, containerH: 600, labelOutput: 'svg-native'
    });
  } finally {
    process.stderr.write = origWrite;
  }
  return chunks.join('').split(/\r?\n/).filter(l => l.startsWith('[write] ')).join('\n');
}

function runOracle(file) {
  const env = Object.assign({}, process.env);
  if (oracleDir) env.ASYMPTOTE_DIR = oracleDir;
  return execFileSync(oracle, ['-offscreen', file], {env, encoding: 'utf8', timeout: 60000});
}

const files = (only.length ? only : fs.readdirSync(__dirname).filter(f => f.endsWith('.asy')))
  .map(f => path.join(__dirname, path.basename(f)));

let pass = 0, fail = 0;
for (const file of files) {
  const name = path.basename(file);
  const src = fs.readFileSync(file, 'utf8');
  let htx;
  try {
    htx = normalize(runHitexer(src));
  } catch (e) {
    console.log(`FAIL ${name}: HiTeXeR threw: ${e.message}`);
    fail++;
    continue;
  }
  if (!oracle) {
    console.log(`--- ${name} (HiTeXeR) ---\n${htx}\n`);
    pass++;
    continue;
  }
  let asy;
  try {
    asy = normalize(runOracle(file));
  } catch (e) {
    console.log(`FAIL ${name}: oracle threw: ${(e.stderr || e.message || '').toString().slice(0, 500)}`);
    fail++;
    continue;
  }
  if (htx === asy) {
    console.log(`PASS ${name}`);
    pass++;
  } else {
    console.log(`FAIL ${name}`);
    const h = htx.split('\n'), a = asy.split('\n');
    for (let i = 0; i < Math.max(h.length, a.length); i++) {
      if (h[i] !== a[i]) console.log(`  line ${i + 1}: htx=${JSON.stringify(h[i])} asy=${JSON.stringify(a[i])}`);
    }
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
