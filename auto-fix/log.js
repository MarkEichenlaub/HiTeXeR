// auto-fix/log.js
// Helper for the sub-agent: append a well-formed JSON line to attempts.jsonl
// and (when a fix is non-`fix`) bump skiplist.json if the 3-strike threshold is reached.
//
// usage:
//   node auto-fix/log.js --id 05896 --verdict fix \
//        --pre 0.42 --post 0.88 --canary-worst -0.01 --family-worst -0.005 \
//        --commit abc1234 --notes "fixed layer() ignoring shift"
//
// Allowed verdicts: fix | ssim-artifact | attempted-no-improve |
//                   regressed-canary | error
// (`unfixable-feature` was removed — strict no-giving-up policy.)
'use strict';

const fs   = require('fs');
const path = require('path');

const ATTEMPTS_PATH = path.join(__dirname, 'attempts.jsonl');
const SKIPLIST_PATH = path.join(__dirname, 'skiplist.json');

const VALID_VERDICTS = new Set([
  'fix','ssim-artifact','attempted-no-improve','regressed-canary','error'
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const v = argv[i+1];
    const key = k.slice(2);
    if (v === undefined || v.startsWith('--')) { out[key] = true; continue; }
    out[key] = v;
    i++;
  }
  return out;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = args.id;
  const verdict = args.verdict;
  if (!id || !verdict) {
    console.error('usage: node auto-fix/log.js --id <ID> --verdict <verdict> [--pre X --post X --canary-worst X --family-worst X --commit X --notes "..."]');
    process.exit(2);
  }
  if (!VALID_VERDICTS.has(verdict)) {
    console.error('invalid --verdict "' + verdict + '". allowed: ' + [...VALID_VERDICTS].join(', '));
    process.exit(2);
  }

  const entry = {
    ts: new Date().toISOString(),
    id,
    verdict,
    preSsim:     num(args.pre),
    postSsim:    num(args.post),
    canaryWorst: num(args['canary-worst']),
    familyWorst: num(args['family-worst']),
    commit:      args.commit || null,
    notes:       args.notes || ''
  };

  fs.appendFileSync(ATTEMPTS_PATH, JSON.stringify(entry) + '\n');

  // Update skiplist if this ID has now hit 3 non-fix verdicts.
  const attempts = fs.readFileSync(ATTEMPTS_PATH, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const history = attempts.filter(a => a.id === id);
  const hasFix = history.some(a => a.verdict === 'fix' || a.verdict === 'ssim-artifact');
  const nonFix = history.filter(a =>
    ['attempted-no-improve','regressed-canary','unfixable-feature','error'].includes(a.verdict)
    // unfixable-feature retained here for backward-compat with pre-existing log entries
  );
  if (!hasFix && nonFix.length >= 3) {
    let sk = { ids: [] };
    if (fs.existsSync(SKIPLIST_PATH)) {
      try { sk = JSON.parse(fs.readFileSync(SKIPLIST_PATH, 'utf8')); } catch {}
      if (!Array.isArray(sk.ids)) sk.ids = [];
    }
    if (!sk.ids.includes(id)) {
      sk.ids.push(id);
      fs.writeFileSync(SKIPLIST_PATH, JSON.stringify(sk, null, 2) + '\n');
      console.error('[log.js] added ' + id + ' to skiplist.json (' + nonFix.length + ' non-fix attempts)');
    }
  }

  console.log(JSON.stringify(entry));
}

main();
