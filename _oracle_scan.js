// Parallel oracle scan: render corpus ids via local asy (TeXeR wrapper), read
// the EPS %%BoundingBox, predict the TeXeR png dims (bp * 10/3), and compare
// with the stored comparison/texer_pngs/<id>.png. Flags refs that disagree.
// usage: node _oracle_scan.js <loId> <hiId> [outFile]
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const TMP = 'C:\\Users\\Public\\htx_oracle\\scan';
fs.mkdirSync(TMP, { recursive: true });
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';
const lo = parseInt(process.argv[2], 10), hi = parseInt(process.argv[3], 10);
const OUT = process.argv[4] || '_oracle_scan.json';
const PXBP = 10 / 3;

const results = [];

// Resume: skip ids already present in a previous (checkpointed) output file.
const prior = new Map();
try { for (const r of JSON.parse(fs.readFileSync(OUT, 'utf8'))) prior.set(r.id, r); } catch (e) {}

const ids = [];
for (let i = lo; i <= hi; i++) {
  const sid = String(i).padStart(5, '0');
  if (prior.has(sid)) { results.push(prior.get(sid)); continue; }
  if (fs.existsSync(path.join('comparison', 'asy_src', sid + '.asy')) &&
      fs.existsSync(path.join('comparison', 'texer_pngs', sid + '.png'))) ids.push(sid);
}
console.log(ids.length + ' ids to scan (' + prior.size + ' resumed from ' + OUT + ')');

function pngDims(f) { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

function wrapVariants(code) {
  code = code.replace(/^(?:\\t)+/gm, m => '\t'.repeat(m.length / 2));
  const hasImport = /import\s+(graph|olympiad)\s*;/.test(code);
  const match = /size\w*\s*[(=]\s*[\d.]/.test(code);
  const tail = 'size(400,400);\n' + code + (match ? '' : '\nsize(150,150);') + '\n';
  // TeXeR provides graph/olympiad/cse5 built-ins without imports; locally we
  // must prepend. Never double-import graph (ambiguous overloads).
  const pres = hasImport ? [''] : ['import graph;\n', 'import olympiad;\n', 'import olympiad;\nimport cse5;\n'];
  return pres.map(p => p + tail);
}

let next = 0, active = 0, done = 0;
const CONC = Math.min(8, Math.max(2, os.cpus().length - 2));

// node-on-windows spawn can throw synchronously (errno -4094 UNKNOWN) under
// load — this killed the first full-scan run. Route both sync throws and
// transient spawn failures into a bounded retry instead of crashing.
function execFileRetry(file, args, opts, attempt, cb) {
  let child;
  try {
    child = execFile(file, args, opts, cb);
  } catch (e) {
    if (attempt < 5) setTimeout(() => execFileRetry(file, args, opts, attempt + 1, cb), 500 * (attempt + 1));
    else cb(e, '', String(e));
    return;
  }
  child.on('error', () => {}); // 'error' also surfaces via the callback
}

function runOne(sid, slot, cb) {
  const code = fs.readFileSync(path.join('comparison', 'asy_src', sid + '.asy'), 'utf8');
  // per-slot working dir: parallel asy/latex runs in a shared cwd collide on
  // aux/temp files and fail spuriously
  const wd = path.join(TMP, 'w' + slot);
  fs.mkdirSync(wd, { recursive: true });
  const variants = wrapVariants(code);
  const ef = path.join(wd, 's' + sid + '.eps');

  function attempt(vi, lastErr, lastStderr) {
    if (vi >= variants.length) {
      results.push({ id: sid, err: (lastErr && lastErr.killed) ? 'timeout' : 'asy-fail', detail: String(lastStderr || '').slice(-200) });
      finish();
      return;
    }
    fs.writeFileSync(path.join(wd, 's' + sid + '.asy'), variants[vi]);
    try { fs.unlinkSync(ef); } catch (e) {}
    execFileRetry(ASY, ['-f', 'eps', '-render=0', '-o', 's' + sid, 's' + sid + '.asy'], { cwd: wd, timeout: 45000, windowsHide: true }, 0, (err, stdout, stderr) => {
      let rec = null;
      try {
        const eps = fs.readFileSync(ef, 'latin1');
        const m = eps.match(/%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
        if (m) {
          const w = (+m[3] - +m[1]), h = (+m[4] - +m[2]);
          const [rw, rh] = pngDims(path.join('comparison', 'texer_pngs', sid + '.png'));
          const pw = w * PXBP, ph = h * PXBP;
          rec = { id: sid, predW: Math.round(pw), predH: Math.round(ph), refW: rw, refH: rh,
                  dw: rw / pw, dh: rh / ph };
          rec.bad = (Math.abs(rec.dw - 1) > 0.05 || Math.abs(rec.dh - 1) > 0.05);
        }
      } catch (e) {}
      if (rec) { results.push(rec); finish(); }
      else attempt(vi + 1, err, stderr);
    });
  }
  function finish() {
    done++;
    if (done % 100 === 0) console.log(done + '/' + ids.length + ' scanned, ' + results.filter(r => r.bad).length + ' flagged');
    if (done % 300 === 0) {
      try { fs.writeFileSync(OUT, JSON.stringify(results.slice().sort((a, b) => a.id.localeCompare(b.id)), null, 1)); } catch (e) {}
    }
    cb();
  }
  attempt(0, null, null);
}

const freeSlots = [];
for (let s = 0; s < CONC; s++) freeSlots.push(s);
function pump() {
  while (freeSlots.length > 0 && next < ids.length) {
    active++;
    const slot = freeSlots.pop();
    runOne(ids[next++], slot, () => { active--; freeSlots.push(slot); pump(); });
  }
  if (active === 0 && next >= ids.length) {
    results.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    const bad = results.filter(r => r.bad), errs = results.filter(r => r.err);
    console.log('DONE. flagged=' + bad.length + ' errors=' + errs.length + ' of ' + results.length);
    fs.writeFileSync('_refetch_ids.txt', bad.map(r => r.id).join(','));
  }
}
pump();
