'use strict';
// SSIM gate for behavior changes. Renders the given ids with a BASE interpreter
// (a git revision) and with the working tree, rasterizes both through Blink, and
// scores each against the TeXeR reference PNG with the same metric as
// auto-fix/render-and-score.js (fast mode: raw SSIM x size score).
//   node refactor/gate.js --rev HEAD --ids a,b,c      (or --from diff.json)
// Prints per-id before/after and a summary; lists regressions > 0.01.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const rev = arg('--rev') || 'HEAD';
let ids = (arg('--ids') || '').split(',').filter(Boolean);
if (arg('--idfile')) ids = ids.concat(fs.readFileSync(arg('--idfile'), 'utf8').split(/[\s,]+/).filter(Boolean));
const WORK = path.join(__dirname, '.gate');
const SNAP = path.join(WORK, 'snap-' + rev.replace(/[^\w.-]/g, '_'));

function snapshot() {
  fs.mkdirSync(SNAP, { recursive: true });
  for (const f of ['asy-interp.js', 'katex-svg.js', 'htx-doc-render.js']) {
    fs.writeFileSync(path.join(SNAP, f), cp.execFileSync('git', ['show', rev + ':' + f], { cwd: ROOT, maxBuffer: 1 << 28 }));
  }
  fs.copyFileSync(path.join(ROOT, 'katex-glyphs.json'), path.join(SNAP, 'katex-glyphs.json'));
}

// Render ids with the interpreter in dir -> svg files in outDir (child process
// so the two interpreters never share a module cache).
function renderAll(dir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const script = `
    const fs=require('fs'),path=require('path');global.window={};global.katex=require(${JSON.stringify(require.resolve('katex'))});
    const NL=String.fromCharCode(10);console.log=console.warn=console.info=()=>{};
    require(${JSON.stringify(path.join(dir, 'asy-interp.js'))});const htx=require(${JSON.stringify(path.join(dir, 'htx-doc-render.js'))});
    for (const id of ${JSON.stringify(ids)}) { const src=fs.readFileSync(${JSON.stringify(path.join(ROOT, 'comparison/asy_src'))}+'/'+id+'.asy','utf8');
      let svg='';try{svg=htx.isDocument(src)?htx.renderDocSVG(src,window.AsyInterp,{containerW:800,containerH:600,labelOutput:'svg-native',imageCache:{}}):window.AsyInterp.render('[asy]'+NL+src+NL+'[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'}).svg}catch(e){}
      fs.writeFileSync(${JSON.stringify(outDir)}+'/'+id+'.svg',svg);}`;
  cp.execFileSync(process.execPath, ['-e', script], { cwd: dir, stdio: 'inherit', maxBuffer: 1 << 28 });
}

function rgbToRgba(buf, w, h) { const o = Buffer.alloc(w * h * 4); for (let i = 0, j = 0; i < w * h; i++) { o[j++] = buf[i*3]; o[j++] = buf[i*3+1]; o[j++] = buf[i*3+2]; o[j++] = 255; } return o; }
async function score(pngBuf, id) {
  const refPng = path.join(ROOT, 'comparison/texer_pngs', id + '.png');
  if (!fs.existsSync(refPng)) return null;
  const refMeta = await sharp(refPng).metadata(), htxMeta = await sharp(pngBuf).metadata();
  const aw = refMeta.width || 1, ah = refMeta.height || 1, hw = htxMeta.width || 1, hh = htxMeta.height || 1;
  const sizeScore = (aw < 100 && ah < 100) ? 1 : Math.exp(-((Math.max(hw, hh) / Math.max(aw, ah) - 1) ** 2) / (2 * 0.15 * 0.15));
  const trimRef = await sharp(refPng).flatten({ background: '#fff' }).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const trimHtx = await sharp(pngBuf).flatten({ background: '#fff' }).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const maxW = Math.max(trimRef.info.width, trimHtx.info.width), maxH = Math.max(trimRef.info.height, trimHtx.info.height);
  const sc = Math.min(400 / maxW, 400 / maxH, 1);
  const W = Math.max(Math.round(maxW * sc), 11), H = Math.max(Math.round(maxH * sc), 11);
  const a = await sharp(trimRef.data).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const b = await sharp(trimHtx.data).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const s = computeSSIM({ data: rgbToRgba(a, W, H), width: W, height: H }, { data: rgbToRgba(b, W, H), width: W, height: H }).mssim;
  return s * sizeScore;
}

(async () => {
  if (!ids.length) { console.error('no ids'); process.exit(2); }
  snapshot();
  const beforeDir = path.join(WORK, 'before'), afterDir = path.join(WORK, 'after');
  for (const d of [beforeDir, afterDir]) fs.rmSync(d, { recursive: true, force: true });
  renderAll(SNAP, beforeDir);
  renderAll(ROOT, afterDir);
  const blink = require(path.join(ROOT, 'blink-raster.js'));
  const rows = [];
  for (const id of ids) {
    const r = { id };
    for (const [k, d] of [['before', beforeDir], ['after', afterDir]]) {
      let svg = fs.readFileSync(path.join(d, id + '.svg'), 'utf8');
      if (!svg) { r[k] = 0; continue; }
      const iw = svg.match(/data-intrinsic-w="([^"]+)"/), ih = svg.match(/data-intrinsic-h="([^"]+)"/);
      if (iw && ih) { svg = svg.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${iw[1]}"`).replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`); }
      try { r[k] = await score(await blink.rasterizeSVG(svg, {}), id); } catch (e) { r[k] = 0; }
    }
    if (r.before != null && r.after != null) r.d = r.after - r.before;
    rows.push(r);
    console.log(id, r.before == null ? '-' : r.before.toFixed(4), '->', r.after == null ? '-' : r.after.toFixed(4), r.d == null ? '' : (r.d >= 0 ? '+' : '') + r.d.toFixed(4));
  }
  await blink.closeBrowser();
  const sc = rows.filter(r => r.d != null);
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  console.log(`\nscored ${sc.length}: mean before ${mean(sc.map(r => r.before)).toFixed(4)} after ${mean(sc.map(r => r.after)).toFixed(4)}; better ${sc.filter(r => r.d > 0.005).length}, worse ${sc.filter(r => r.d < -0.005).length}`);
  const bad = sc.filter(r => r.d < -0.01).sort((a, b) => a.d - b.d);
  if (bad.length) console.log('REGRESSIONS: ' + bad.map(r => r.id + '(' + r.d.toFixed(3) + ')').join(' '));
  fs.writeFileSync(path.join(WORK, 'last.json'), JSON.stringify(rows, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
