'use strict';
// Language/library conformance suite: runs each tests/*.asy file through real
// Asymptote (the oracle) and through HiTeXeR, then diffs the write() output
// statement by statement.
//
//   node refactor/conformance/run.js                  # all tests
//   node refactor/conformance/run.js arith.asy pairs  # selected tests
//   options:
//     --no-cache     re-run real asy even if its cached output is current
//     --json <file>  write machine-readable results (default: results.json here)
//     --quiet        only print the per-file summary lines
//     --show         print both outputs for each selected file
//     --working      test the working-tree asy-interp.js (default: git HEAD)
//     --rev <commit> test asy-interp.js as of <commit>
//
// How lines are attributed: every source line that starts with `write(` (or one
// of the printing helpers wi/wr/wb/ws/wp/wi2/wr2/wpath defined at the top of
// the tests that use them) gets a
// `write("@@L<n>");` marker spliced onto the front of it (same physical line, so
// line numbers are preserved). Output between two markers belongs to the source
// line of the first one. Tests must therefore keep braces around loop/if bodies
// that contain a write (a brace-less body would capture only the marker).
//
// Number formatting: real asy 3.06 prints reals with %.15g-style output
// (e.g. 1/3 -> 0.333333333333333). HiTeXeR is expected to match that exactly.
// A mismatch whose non-numeric skeleton is identical and whose numbers agree to
// 1e-9 relative is classified "epsilon" (numerical noise, e.g. Cos(90) giving
// 6e-17 instead of asy's exact 0); if the numbers parse to the identical double
// it is "format" (e.g. 1e-05 vs 0.00001, -0 vs 0). Anything else is "value";
// "missing" means HiTeXeR printed nothing for that write (usually an unknown
// function). All kinds are reported.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {execFileSync, spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
const TEST_DIR = path.join(__dirname, 'tests');
const CACHE_DIR = path.join(__dirname, '.cache');

// ---------------------------------------------------------------- child mode
// `node run.js --htx-one <instrumented.asy>` renders one file in-process and
// prints the raw stderr stream as JSON on stdout. Run as a child so a hang or a
// crash in the interpreter can't take down the suite.
if (process.argv[2] === '--htx-one') {
  process.env.HTX_WRITE = '1';
  global.window = {};
  global.katex = require(path.join(ROOT, 'node_modules', 'katex'));
  require(process.argv[4] || path.join(ROOT, 'asy-interp.js'));
  const src = fs.readFileSync(process.argv[3], 'utf8');
  const chunks = [];
  const origWrite = process.stderr.write;
  const origWarn = console.warn, origErr = console.error, origLog = console.log;
  process.stderr.write = (s) => { chunks.push(String(s)); return true; };
  console.warn = (...a) => chunks.push('[console.warn] ' + a.join(' ') + '\n');
  console.error = (...a) => chunks.push('[console.error] ' + a.join(' ') + '\n');
  console.log = (...a) => chunks.push('[console.log] ' + a.join(' ') + '\n');
  let thrown = null, warnings = [];
  try {
    const r = global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', {
      containerW: 800, containerH: 600, labelOutput: 'svg-native'
    });
    if (r && Array.isArray(r.warnings)) warnings = r.warnings.map(String);
  } catch (e) {
    thrown = String(e && e.stack || e).split('\n').slice(0, 4).join('\n');
  }
  process.stderr.write = origWrite;
  console.warn = origWarn; console.error = origErr; console.log = origLog;
  process.stdout.write(JSON.stringify({chunks, thrown, warnings}));
  process.exit(0);
}

// ---------------------------------------------------------------- helpers
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const jsonIdx = argv.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : path.join(__dirname, 'results.json');
const revIdx = argv.indexOf('--rev');
const selected = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json' && argv[i - 1] !== '--rev');

// Which interpreter to test. Default: the committed HEAD version, extracted
// into .snapshot/ (asy-interp.js is often mid-edit in the working tree, and a
// half-edited file can fail to even load). --working tests the working copy;
// --rev <commit> tests any commit.
function interpPath() {
  if (flag('--working')) return path.join(ROOT, 'asy-interp.js');
  const rev = revIdx >= 0 ? argv[revIdx + 1] : 'HEAD';
  const sha = execFileSync('git', ['rev-parse', '--short', rev], {cwd: ROOT, encoding: 'utf8'}).trim();
  const snap = path.join(__dirname, '.snapshot', sha);
  if (!fs.existsSync(path.join(snap, 'asy-interp.js'))) {
    fs.mkdirSync(snap, {recursive: true});
    for (const f of ['asy-interp.js', 'katex-svg.js', 'katex-glyphs.json']) {
      fs.writeFileSync(path.join(snap, f), execFileSync('git', ['show', sha + ':' + f], {cwd: ROOT, maxBuffer: 256 << 20}));
    }
  }
  return path.join(snap, 'asy-interp.js');
}
const INTERP = interpPath();

function instrument(src) {
  return src.split(/\r?\n/).map((l, i) =>
    /^\s*(write|wi|wr|wb|ws|wp|wi2|wr2|wpath)\s*\(/.test(l) ? l.replace(/^(\s*)/, `$1write("@@L${i + 1}");`) : l
  ).join('\n');
}

function normLine(l) {
  return l.replace(/\s+$/, '')
    .replace(/-?nan(\(ind\))?/gi, 'nan')
    .replace(/-?1\.#IND/g, 'nan')
    .replace(/\binf(inity)?\b/g, 'inf');
}

// Split an output stream into [{line, out:[...], notes:[...]}] segments.
function segment(lines, notesByIdx) {
  const segs = [];
  let cur = {line: 0, out: [], notes: []};
  segs.push(cur);
  // notesByIdx[i] = diagnostics emitted before output line i was produced.
  lines.forEach((raw, i) => {
    if (notesByIdx && notesByIdx[i]) cur.notes.push(...notesByIdx[i]);
    const m = /^@@L(\d+)\s*$/.exec(raw);
    if (m) { cur = {line: +m[1], out: [], notes: []}; segs.push(cur); }
    else if (raw.trim() !== '') cur.out.push(normLine(raw));
  });
  if (notesByIdx && notesByIdx[lines.length]) cur.notes.push(...notesByIdx[lines.length]);
  if (segs[0].out.length === 0 && segs[0].notes.length === 0) segs.shift();
  return segs;
}

function runAsy(name, instrumented) {
  const key = crypto.createHash('sha1').update(instrumented).digest('hex').slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, name.replace(/\.asy$/, '') + '.' + key + '.json');
  if (!flag('--no-cache') && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'htx-conf-'));
  const f = path.join(scratch, name);
  fs.writeFileSync(f, instrumented);
  const r = spawnSync(ASY, ['-noV', '-offscreen', name], {cwd: scratch, encoding: 'utf8', timeout: 120000});
  try { fs.rmSync(scratch, {recursive: true, force: true}); } catch (e) {}
  const res = {stdout: r.stdout || '', stderr: r.stderr || '', status: r.status};
  fs.mkdirSync(CACHE_DIR, {recursive: true});
  for (const old of fs.readdirSync(CACHE_DIR)) {
    if (old.startsWith(name.replace(/\.asy$/, '') + '.') && old !== path.basename(cacheFile)) fs.unlinkSync(path.join(CACHE_DIR, old));
  }
  fs.writeFileSync(cacheFile, JSON.stringify(res));
  return res;
}

function runHtx(instrumented) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'htx-conf-h-'));
  const f = path.join(scratch, 't.asy');
  fs.writeFileSync(f, instrumented);
  const r = spawnSync(process.execPath, [__filename, '--htx-one', f, INTERP], {encoding: 'utf8', timeout: 120000, maxBuffer: 64 << 20});
  try { fs.rmSync(scratch, {recursive: true, force: true}); } catch (e) {}
  if (r.error || r.status !== 0) {
    return {lines: [], notes: {}, thrown: 'child failed: ' + (r.error ? r.error.message : (r.stderr || '').slice(0, 400))};
  }
  const {chunks, thrown} = JSON.parse(r.stdout);
  // Rebuild the write() stream. A [write] chunk may contain embedded newlines
  // (arrays); non-write chunks (unknown-call diagnostics, warnings) become notes
  // attached to the output line index at which they occurred.
  const lines = [], notes = {};
  let buf = '';
  for (const c of chunks) {
    if (c.startsWith('[write] ')) buf += c.slice(8);
    else {
      const flushed = buf.split('\n'); buf = flushed.pop();
      lines.push(...flushed);
      const msg = c.trim();
      if (/HTX-unknown-call|error|Error|undefined|not supported|unsupported|cannot|failed/i.test(msg)) {
        (notes[lines.length] = notes[lines.length] || []).push(msg.slice(0, 300));
      }
      continue;
    }
    const parts = buf.split('\n'); buf = parts.pop(); lines.push(...parts);
  }
  if (buf) lines.push(buf);
  return {lines, notes, thrown};
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
function classify(a, h) {
  if (h === undefined) return 'missing';
  if (a === undefined) return 'extra';
  const sa = a.replace(NUM, '#'), sh = h.replace(NUM, '#');
  if (sa !== sh) return 'value';
  const na = a.match(NUM) || [], nh = h.match(NUM) || [];
  let kind = 'format';
  for (let i = 0; i < na.length; i++) {
    const x = +na[i], y = +nh[i];
    if (x === y) continue;
    const tol = 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    if (!(Math.abs(x - y) <= tol)) return 'value';
    kind = 'epsilon';
  }
  return kind;
}

// Align segments by marker sequence (LCS on source-line numbers).
function alignSegs(A, H) {
  const n = A.length, m = H.length;
  const dp = Array.from({length: n + 1}, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i].line === H[j].line ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i].line === H[j].line) { out.push([A[i], H[j]]); i++; j++; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) { out.push([A[i], null]); i++; }
    else { out.push([null, H[j]]); j++; }
  }
  return out;
}

// ---------------------------------------------------------------- main
const allFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.asy')).sort();
const files = selected.length
  ? allFiles.filter(f => selected.some(s => f === s || f === s + '.asy' || f.replace(/\.asy$/, '') === path.basename(s, '.asy')))
  : allFiles;

const results = [];
let totChecks = 0, totFormat = 0, totEps = 0, totValue = 0, totMissing = 0;
for (const name of files) {
  const src = fs.readFileSync(path.join(TEST_DIR, name), 'utf8');
  const srcLines = src.split(/\r?\n/);
  const inst = instrument(src);
  const asy = runAsy(name, inst);
  const htx = runHtx(inst);
  const A = segment(asy.stdout.split(/\r?\n/));
  const H = segment(htx.lines, htx.notes);
  const fileRes = {file: name, asyStatus: asy.status, asyStderr: asy.stderr.trim(), htxThrown: htx.thrown, checks: 0, mismatches: []};
  if (flag('--show')) {
    console.log(`--- ${name} asy ---\n${asy.stdout}\n${asy.stderr}`);
    console.log(`--- ${name} htx ---\n${htx.lines.join('\n')}\n${htx.thrown || ''}`);
  }
  for (const [a, h] of alignSegs(A, H)) {
    const line = (a || h).line;
    fileRes.checks++;
    const ao = a ? a.out : [], ho = h ? h.out : [];
    if (a && h && ao.join('\n') === ho.join('\n')) continue;
    let kind;
    if (!h) kind = 'missing';
    else if (!a) kind = 'extra';
    else {
      const kinds = [];
      for (let k = 0; k < Math.max(ao.length, ho.length); k++) if (ao[k] !== ho[k]) kinds.push(classify(ao[k], ho[k]));
      kind = ['value', 'missing', 'extra', 'epsilon', 'format'].find(k => kinds.includes(k));
    }
    fileRes.mismatches.push({line, src: (srcLines[line - 1] || '').trim(), kind, asy: ao, htx: ho, notes: h ? h.notes : []});
  }
  const nf = fileRes.mismatches.filter(m => m.kind === 'format').length;
  const ne = fileRes.mismatches.filter(m => m.kind === 'epsilon').length;
  const nv = fileRes.mismatches.length - nf - ne;
  totChecks += fileRes.checks; totFormat += nf; totValue += nv; totEps += ne;
  totMissing += fileRes.mismatches.filter(m => m.kind === 'missing').length;
  const status = asy.status !== 0 ? ' [ASY ERROR: ' + asy.stderr.trim().split('\n').pop() + ']' : '';
  console.log(`${fileRes.mismatches.length ? 'FAIL' : 'PASS'} ${name}: ${fileRes.checks} checks, ${nv} value, ${ne} epsilon, ${nf} format${htx.thrown ? ' [HTX THREW]' : ''}${status}`);
  if (!flag('--quiet')) {
    for (const mm of fileRes.mismatches) {
      console.log(`  L${mm.line} [${mm.kind}] ${mm.src}`);
      console.log(`      asy: ${JSON.stringify(mm.asy.join(' | '))}`);
      console.log(`      htx: ${JSON.stringify(mm.htx.join(' | '))}`);
      if (mm.notes.length) console.log(`      notes: ${mm.notes.join(' ; ').slice(0, 300)}`);
    }
    if (htx.thrown) console.log('  HTX threw: ' + htx.thrown);
  }
  results.push(fileRes);
}
console.log(`\ninterpreter: ${path.relative(ROOT, INTERP)}`);
console.log(`${files.length} files, ${totChecks} checks, ${totValue} value mismatches (${totMissing} missing), ${totEps} epsilon (agree to 1e-9), ${totFormat} format-only`);
fs.writeFileSync(jsonOut, JSON.stringify({generated: new Date().toISOString(), interpreter: path.relative(ROOT, INTERP), totChecks, totValue, totEps, totFormat, results}, null, 1));
