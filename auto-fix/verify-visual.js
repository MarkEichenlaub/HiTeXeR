// auto-fix/verify-visual.js
// Fresh-context visual verifier for the auto-fix loop.
//
// Spawns a new `claude -p` session (sonnet by default) whose ONLY job is to
// Read the TeXeR reference PNG and the HiTeXeR PNG and decide whether they
// visually match. Having no knowledge of the edit history prevents the
// rationalization-toward-done failure mode the edit agent sometimes hits.
//
// Usage:
//   node auto-fix/verify-visual.js --id 08899 \
//        --ref comparison/texer_pngs/08899.png \
//        --htx comparison/htx_pngs/08899.png
//
// stdout: stream of progress events, terminated by a single line:
//   [VERDICT] {"match": true|false, "defects": ["..."], "confidence": "high|medium|low"}
// Exit codes:
//   0  verdict emitted (match or no-match)
//   3  verifier timed out
//   4  output unparseable
'use strict';

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MODEL   = 'claude-sonnet-4-5';
const DEFAULT_TIMEOUT = 10 * 60 * 1000;  // 10 min
const DEFAULT_TURNS   = 20;

function parseArgs(argv) {
  const out = { id: null, ref: null, htx: null, model: DEFAULT_MODEL, timeoutMs: DEFAULT_TIMEOUT, maxTurns: DEFAULT_TURNS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') out.id = argv[++i];
    else if (a === '--ref') out.ref = argv[++i];
    else if (a === '--htx') out.htx = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--timeout-ms') out.timeoutMs = parseInt(argv[++i], 10);
    else if (a === '--max-turns') out.maxTurns = parseInt(argv[++i], 10);
    else { console.error('unknown arg: ' + a); process.exit(2); }
  }
  if (!out.id || !out.ref || !out.htx) {
    console.error('usage: node auto-fix/verify-visual.js --id X --ref PATH --htx PATH [--model M]');
    process.exit(2);
  }
  return out;
}

function buildPrompt(args) {
  const ref = path.isAbsolute(args.ref) ? args.ref : path.join(ROOT, args.ref);
  const htx = path.isAbsolute(args.htx) ? args.htx : path.join(ROOT, args.htx);
  return [
    'You are a visual inspection assistant for the HiTeXeR auto-fix loop.',
    'Your ONLY job is to compare two images and rate how well they match.',
    '',
    'TARGET DIAGRAM: ' + args.id,
    'REFERENCE IMAGE (the correct rendering): ' + ref,
    'TEST IMAGE (what we are evaluating):      ' + htx,
    '',
    'TASK:',
    '1. Read both images using the Read tool.',
    '2. Compare them on: STRUCTURE (shapes, lines, primitives), COLOR,',
    '   ORIENTATION, SCALE, and LABEL PLACEMENT (positions and content of text).',
    '3. Rate the match quality at one of three levels:',
    '   - "good"  : essentially perfect. Only minor antialiasing, sub-pixel font',
    '               rendering, or barely-noticeable color variations. A human',
    '               viewer would say the images look the same.',
    '   - "minor" : recognizable match with small cosmetic differences that do NOT',
    '               affect the mathematical content — e.g. slightly different font',
    '               fallback, small label positioning shift (<10% of diagram size),',
    '               slightly different line weight, or minor color variation.',
    '               The diagram is clearly the same mathematical figure.',
    '   - "poor"  : significant defects that would confuse or mislead a reader —',
    '               wrong or missing shapes, wrong color fills/strokes, wrong',
    '               orientation, wrong scale (>15% size difference), labels in',
    '               wrong positions or with wrong text, missing major elements,',
    '               extra spurious elements, overlapping text that should be apart.',
    '4. Use "minor" when the diagram conveys the correct mathematics with cosmetic',
    '   differences. Reserve "poor" for structurally wrong or incomplete renders.',
    '',
    'OUTPUT:',
    'Your FINAL message must be a single JSON object on its own line, with no',
    'surrounding prose. The "quality" field is required.',
    'Example (good):',
    '  {"quality": "good", "defects": [], "confidence": "high"}',
    'Example (minor issues):',
    '  {"quality": "minor", "defects": ["label font slightly different", "tick spacing 2px off"], "confidence": "high"}',
    'Example (poor match):',
    '  {"quality": "poor", "defects": ["blue fill circle missing", "axes scale wrong"], "confidence": "high"}',
    '',
    'CONSTRAINTS:',
    '- Do NOT edit any files. Do NOT run bash. Only use the Read tool.',
    '- Do NOT consider SSIM scores, file sizes, or anything outside the images.',
    '- Rate based on visual impact to a math student reading the diagram.',
    '',
    'Begin.',
  ].join('\n');
}

function truncate(s, n) {
  if (s == null) return '';
  if (typeof s !== 'string') { try { s = JSON.stringify(s); } catch { s = String(s); } }
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function printStreamEvent(ev) {
  if (!ev || typeof ev !== 'object') return;
  if (ev.type === 'system' && ev.subtype === 'init') {
    console.log('[verify] init model=' + (ev.model || '?'));
    return;
  }
  if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text) {
        process.stdout.write('[verify-text] ' + c.text);
        if (!c.text.endsWith('\n')) process.stdout.write('\n');
      } else if (c.type === 'tool_use') {
        console.log('[verify-tool:' + c.name + '] ' + truncate(JSON.stringify(c.input), 160));
      }
    }
    return;
  }
  if (ev.type === 'result') {
    console.log('[verify] result cost=$' + (ev.total_cost_usd || 0).toFixed(4) +
                ' turns=' + (ev.num_turns || '?') +
                ' dur=' + ((ev.duration_ms || 0)/1000).toFixed(1) + 's');
    return;
  }
}

function extractVerdict(allText) {
  // Find the last brace-delimited chunk that parses as a verdict object.
  // Accepts new-style {quality: "good"/"minor"/"poor"} or legacy {match: bool}.
  // Scans the full text so the last emitted verdict wins.
  const re = /\{[^{}]*\}/g;
  let m, last = null;
  while ((m = re.exec(allText)) !== null) {
    const s = m[0];
    const hasQuality = /"quality"\s*:\s*"(good|minor|poor)"/.test(s);
    const hasMatch   = /"match"\s*:\s*(true|false)/.test(s);
    if (!hasQuality && !hasMatch) continue;
    try {
      const obj = JSON.parse(s);
      if (obj.quality || typeof obj.match === 'boolean') last = obj;
    } catch { /* ignore */ }
  }
  if (last) {
    // Normalise: derive the missing field so callers always have both.
    if (last.quality && typeof last.match !== 'boolean') {
      last.match = last.quality !== 'poor';
    } else if (typeof last.match === 'boolean' && !last.quality) {
      last.quality = last.match ? 'good' : 'poor';
    }
  }
  return last;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const prompt = buildPrompt(args);

  const subArgs = [
    '-p',
    '--permission-mode', 'bypassPermissions',
    '--model', args.model,
    '--max-turns', String(args.maxTurns),
    '--output-format', 'stream-json',
    '--verbose',
  ];
  const sub = cp.spawn('claude', subArgs, {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { sub.kill('SIGTERM'); } catch {} }, args.timeoutMs);

  let allText = '';
  let buf = '';
  sub.stdout.setEncoding('utf8');
  sub.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      printStreamEvent(ev);
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const c of ev.message.content) {
          if (c.type === 'text' && c.text) allText += c.text + '\n';
        }
      }
    }
  });

  try { sub.stdin.write(prompt); sub.stdin.end(); }
  catch (e) { console.error('[verify] stdin write failed: ' + (e && e.message)); }

  await new Promise(resolve => sub.on('close', resolve));
  clearTimeout(timer);

  if (timedOut) {
    console.error('[verify] timed out');
    process.stdout.write('\n[VERDICT] ' + JSON.stringify({
      match: null, defects: ['verifier timed out'], confidence: 'none', error: 'timeout'
    }) + '\n');
    process.exit(3);
  }

  const verdict = extractVerdict(allText);
  if (!verdict) {
    console.error('[verify] could not extract verdict from output');
    process.stdout.write('\n[VERDICT] ' + JSON.stringify({
      match: null, defects: ['verifier produced no parseable verdict'], confidence: 'none', error: 'parse'
    }) + '\n');
    process.exit(4);
  }
  // Normalize shape
  if (!Array.isArray(verdict.defects)) verdict.defects = [];
  if (!verdict.confidence) verdict.confidence = 'unknown';
  process.stdout.write('\n[VERDICT] ' + JSON.stringify(verdict) + '\n');
  process.exit(0);
}

run().catch(e => { console.error('[verify] error:', e && e.stack || e); process.exit(1); });
