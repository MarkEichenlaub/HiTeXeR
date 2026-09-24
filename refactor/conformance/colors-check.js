'use strict';
// Named-pen color table check. HiTeXeR has no colors(pen) builtin, so the
// generic write()-diff runner can't compare pen colors. This script asks real
// asy for colors(X) and reads HiTeXeR's pen object (r,g,b) for the same X, both
// converted to RGB, and reports differences above 0.002 (HiTeXeR stores 8-bit
// channels, so x/255 quantization up to 0.5/255 is expected and ignored).
//   node refactor/conformance/colors-check.js [--working]
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync, execFileSync} = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const ASY = 'C:\\Program Files\\Asymptote\\asy.exe';

const NAMES = `red green blue black white gray lightgray mediumgray darkgray heavygray palegray deepgray
orange purple cyan magenta yellow brown pink olive
lightblue lightred lightgreen lightyellow lightcyan lightmagenta lightolive
darkblue darkgreen darkred darkbrown darkcyan darkmagenta darkolive
heavyblue heavygreen heavyred heavycyan heavymagenta
mediumblue mediumgreen mediumred mediumyellow mediumcyan mediummagenta
paleblue palegreen palered paleyellow palecyan palemagenta
deepblue deepgreen deepred deepcyan deepmagenta deepyellow
royalblue springgreen chartreuse fuchsia salmon
Cyan Magenta Yellow Black cmyk(red) gray(0.3) gray(0.75) rgb(0.2,0.4,0.6) RGB(255,128,0)
0.5*red 0.3*blue+0.7*white red+blue red+green 0.5*red+0.5*blue interp(red,blue,0.25) opacity(0.5)+red
rgb("ff8000") lightgray+linewidth(2)`.split(/\s+/).filter(Boolean);

// ---- asy side
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'htx-colors-'));
const asySrc = NAMES.map(n => `write("@@${n.replace(/"/g, "'")}"); write(colorspace(${n})); write(colors(${n}));`).join('\n');
fs.writeFileSync(path.join(scratch, 'c.asy'), asySrc);
const ar = spawnSync(ASY, ['-noV', '-offscreen', 'c.asy'], {cwd: scratch, encoding: 'utf8'});
if (ar.status !== 0) { console.error(ar.stderr); process.exit(1); }
const asy = {};
let cur = null;
for (const l of ar.stdout.split(/\r?\n/)) {
  if (l.startsWith("@@")) { cur = l.slice(2).replace(/'/g, "\""); asy[cur] = {space: null, vals: []}; continue; }
  if (!cur || !l.trim()) continue;
  if (asy[cur].space === null) { asy[cur].space = l.trim(); continue; }
  const m = /^\d+:\s*(\S+)/.exec(l);
  if (m) asy[cur].vals.push(+m[1]);
}
function toRgb(space, v) {
  if (space === 'gray' || v.length === 1) return [v[0], v[0], v[0]];
  if (space === 'cmyk' || v.length === 4) return [0, 1, 2].map(i => (1 - v[i]) * (1 - v[3]));
  if (v.length === 0) return null; // invisible
  return v.slice(0, 3);
}

// ---- HiTeXeR side (pen objects carry r,g,b in 0..1)
const snapFlag = process.argv.includes('--working') ? [] : null;
let interp = path.join(ROOT, 'asy-interp.js');
if (!snapFlag) {
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim();
  const p = path.join(__dirname, '.snapshot', sha, 'asy-interp.js');
  if (fs.existsSync(p)) interp = p; else console.warn('no snapshot for HEAD; run run.js first. Using working copy.');
}
global.window = {};
global.katex = require(path.join(ROOT, 'node_modules', 'katex'));
const origWarn = console.warn; console.warn = () => {};
require(interp);
let captured = null;
const origW = process.stderr.write;
const out = [];
let mismatches = 0;
for (const n of NAMES) {
  // Evaluate the pen expression via a tiny program and fish the pen out of the
  // interpreter's write() JSON.
  process.env.HTX_WRITE = '1';
  const chunks = [];
  process.stderr.write = (s) => { chunks.push(String(s)); return true; };
  try {
    global.window.AsyInterp.render(`[asy]\nwrite(${n});\n[/asy]`, {containerW: 100, containerH: 100, labelOutput: 'svg-native'});
  } catch (e) { chunks.push('[write] THROW ' + e.message); }
  process.stderr.write = origW;
  const w = chunks.find(c => c.startsWith('[write] ')) || '';
  const r = /"r":([-\d.e]+),"g":([-\d.e]+),"b":([-\d.e]+)/.exec(w);
  const a = asy[n] ? toRgb(asy[n].space, asy[n].vals) : null;
  const h = r ? [+r[1], +r[2], +r[3]] : null;
  const bad = !a || !h || a.some((x, i) => Math.abs(x - h[i]) > 0.002);
  if (bad) mismatches++;
  out.push({name: n, asySpace: asy[n] && asy[n].space, asy: a, htx: h, htxRaw: h ? undefined : w.slice(8, 120), ok: !bad});
}
console.warn = origWarn;
for (const o of out.filter(o => !o.ok)) {
  const f = v => v ? '(' + v.map(x => +x.toFixed(6)).join(',') + ')' : 'n/a';
  console.log(`${o.name.padEnd(24)} asy ${o.asySpace} ${f(o.asy).padEnd(28)} htx ${f(o.htx)}${o.htxRaw ? ' raw=' + o.htxRaw : ''}`);
}
console.log(`\n${NAMES.length} pens, ${mismatches} color mismatches`);
fs.writeFileSync(path.join(__dirname, 'results-colors.json'), JSON.stringify(out, null, 1));
try { fs.rmSync(scratch, {recursive: true, force: true}); } catch (e) {}
