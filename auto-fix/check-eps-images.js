// auto-fix/check-eps-images.js
//
// Regression test: confirm that diagrams using graphic("/var/www/cdn/...eps")
// still render with a real image embedded, not a placeholder rectangle.
//
// EPS-image support has been broken multiple times by changes to asy-interp.js
// that, while fixing one diagram, dropped the graphic() pre-fetched image
// payload from rendered SVGs.  This script is invoked by the auto-fix loop
// AFTER each successful commit; a failure causes the iteration to be sent
// back to the AI with a defect note that EPS rendering must be preserved.
//
// Usage:
//   node auto-fix/check-eps-images.js            (default representative set)
//   node auto-fix/check-eps-images.js --all      (every /var/www/cdn diagram)
//
// Exit codes:
//   0  every checked diagram contains a real image (no placeholder rects)
//   1  one or more diagrams failed (details on stdout as JSON)
//   2  infrastructure error (couldn't load interpreter / no asy_src)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const ASY_SRC    = path.join(ROOT, 'comparison', 'asy_src');

// Representative diagrams hand-picked to cover the variety of EPS usage in
// the corpus (rotated/reflected labels, image-inside-clip, multiple graphics
// in one diagram, etc.).  Keep this list short so the check runs in ~1s.
const REP_IDS = ['08957', '09019', '08941', '08929', '08918', '08932', '08924'];

const args = process.argv.slice(2);
const checkAll = args.includes('--all');

function collectIds() {
  if (!checkAll) return REP_IDS.filter(id => fs.existsSync(path.join(ASY_SRC, id + '.asy')));
  // --all: every .asy file that references /var/www/cdn/
  const out = [];
  for (const f of fs.readdirSync(ASY_SRC).sort()) {
    if (!f.endsWith('.asy')) continue;
    const raw = fs.readFileSync(path.join(ASY_SRC, f), 'utf8');
    if (raw.includes('/var/www/cdn/')) out.push(f.replace('.asy', ''));
  }
  return out;
}

function main() {
  let A, epsCache;
  try {
    global.window = global.window || {};
    global.katex = require('katex');
    require(path.join(ROOT, 'asy-interp.js'));
    A = global.window.AsyInterp;
    epsCache = require(path.join(ROOT, 'eps-cache'));
  } catch (e) {
    console.error('[check-eps] failed to load interpreter or eps-cache: ' + e.message);
    process.exit(2);
  }

  const ids = collectIds();
  if (ids.length === 0) {
    console.error('[check-eps] no diagrams to check');
    process.exit(2);
  }

  const failures = [];
  const detail = [];
  for (const id of ids) {
    const raw = fs.readFileSync(path.join(ASY_SRC, id + '.asy'), 'utf8');
    const code = '[asy]\n' + raw + '\n[/asy]';

    if (!A.canInterpret(code)) {
      detail.push({ id, status: 'skip-noninterp' });
      continue;
    }

    let imageCache = {};
    try { imageCache = epsCache.getImageCache(raw); } catch (e) {}

    let svg;
    try {
      svg = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache }).svg;
    } catch (e) {
      failures.push({ id, reason: 'render-threw: ' + e.message.slice(0, 200) });
      continue;
    }

    // Real images appear as either <image href="data:image/png;base64,..."/>
    // or <use href="#htx-img-N"/> (the dedupe path).
    const hasImage = /<image\s[^>]*href="data:image\/png/.test(svg) || /<use\s[^>]*href="#htx-img-/.test(svg);
    // The placeholder appears as <rect ... fill="#e0e0e0" .../> with diagonal
    // gray lines.  A real diagram could conceivably draw an #e0e0e0 rect on its
    // own, but combined with the absence of a real <image>/<use> this is a
    // reliable detector for the placeholder branch.
    const hasPlaceholder = /<rect\b[^>]*fill="#e0e0e0"/.test(svg);

    if (!hasImage || hasPlaceholder) {
      failures.push({
        id,
        reason: !hasImage
          ? 'rendered without embedded image (graphic() returned placeholder)'
          : 'rendered with placeholder rectangle present',
      });
    } else {
      detail.push({ id, status: 'ok' });
    }
  }

  const summary = {
    summary: {
      total: ids.length,
      passed: detail.filter(d => d.status === 'ok').length,
      skipped: detail.filter(d => d.status !== 'ok').length,
      failed: failures.length,
      failures,
    },
  };
  console.log(JSON.stringify(summary));

  if (failures.length > 0) {
    console.error('[check-eps] FAIL: ' + failures.length + ' diagrams broke EPS rendering: ' +
                  failures.map(f => f.id).join(', '));
    process.exit(1);
  }
  console.log('[check-eps] OK: all ' + ids.length + ' EPS-using diagrams rendered with real images');
  process.exit(0);
}

main();
