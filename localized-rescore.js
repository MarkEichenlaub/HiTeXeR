'use strict';
/**
 * localized-rescore.js
 *
 * Re-scores the existing corpus (comparison/texer_pngs vs comparison/htx_pngs)
 * with a LOCALIZED metric instead of the mean-SSIM the pipeline uses.
 *
 * Why: render-and-score.js trims, resizes-to-fill, and reports the MEAN window
 * SSIM (.mssim). A small localized logic bug — a rotated label, a missing tick,
 * a mis-shaded lobe — is one tiny patch of difference averaged across the whole
 * image, so it barely dents the global score and never sinks to the bottom of an
 * SSIM sort. This script keeps the SAME trim+resize preprocessing (so it inherits
 * the pipeline's alignment and introduces no new noise) but reads ssim.js's
 * per-window `ssim_map` and aggregates by WORST CONTIGUOUS CLUSTER, not mean.
 *
 * A diagram that is globally good (combined high) yet has a compact, deep cluster
 * of bad windows is exactly the "hidden on page 74" bug the corpus sort can't see.
 *
 * Outputs:
 *   comparison/localized-scores.json   — per-id metrics, sorted by severity
 *   comparison/localized-review.html   — triage gallery: worst-cluster crops
 *                                        (ref vs htx) side by side, top N
 *   comparison/localized_crops/        — the crop + thumbnail PNGs
 *
 * No AI, no re-render, no corpus mutation — reuses PNGs already on disk.
 *
 * Usage:
 *   node localized-rescore.js                       # full corpus
 *   node localized-rescore.js --limit 500           # quick sample
 *   node localized-rescore.js --collection c        # only cN (team) diagrams
 *   node localized-rescore.js --min-good 0.97 --top 300
 *   node localized-rescore.js --ids 04896,05553     # specific ids
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT      = __dirname;
const COMP      = path.join(ROOT, 'comparison');
const TEXER_DIR = path.join(COMP, 'texer_pngs');
const HTX_DIR   = path.join(COMP, 'htx_pngs');
const SSIM_FILE = path.join(COMP, 'ssim-results.json');
const RAND_FILE = path.join(COMP, 'random-ids.json');
const DROP_FILE = path.join(ROOT, 'auto-fix', 'droplist.json');
const OUT_JSON  = path.join(COMP, 'localized-scores.json');
const OUT_HTML  = path.join(COMP, 'localized-review.html');
const CROP_DIR  = path.join(COMP, 'localized_crops');

// ── args ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const LIMIT    = arg('limit')    ? parseInt(arg('limit'), 10)    : Infinity;
const MIN_GOOD = arg('min-good') ? parseFloat(arg('min-good'))   : 0.95;  // "globally good" gate for the gallery
// A window is "bad" if it falls REL_DROP below the diagram's own blurred mean,
// clamped to [BAD_FLOOR, BAD_CEIL]. Adaptive so a 0.99-mean figure flags subtle
// local drops (<~0.74) while a noisier figure stays strict — finds "locally
// surprising" regions instead of a one-size-fits-all absolute cut.
const REL_DROP  = arg('drop')      ? parseFloat(arg('drop'))      : 0.28;
const BAD_FLOOR = arg('bad-floor') ? parseFloat(arg('bad-floor')) : 0.35;
const BAD_CEIL  = arg('bad-ceil')  ? parseFloat(arg('bad-ceil'))  : 0.80;
const MIN_AREA = arg('min-area') ? parseInt(arg('min-area'), 10) : 6;     // ignore clusters smaller than this (windows)
const AREA_CAP = arg('area-cap') ? parseFloat(arg('area-cap'))  : 0.22;   // localized cluster must cover < this frac of the map
const TOPN     = arg('top')      ? parseInt(arg('top'), 10)      : 400;
const CONC     = arg('conc')     ? parseInt(arg('conc'), 10)     : 8;
const ONLY     = arg('ids') ? String(arg('ids')).split(',').map(s => s.trim()) : null;
const COLL     = arg('collection') ? String(arg('collection')) : null;
const NO_CROPS = !!arg('no-crops');

const MAX = 400; // matches render-and-score.js

function rgbToRgba(buf, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i*4]=buf[i*3]; out[i*4+1]=buf[i*3+1]; out[i*4+2]=buf[i*3+2]; out[i*4+3]=255; }
  return out;
}

// Trim + resize-to-fill, identical to render-and-score.js, returning both the
// raw RGB buffers (for SSIM) and the trimmed PNG buffers (for cropping).
async function prep(refPng, htxPng) {
  const trimRef = await sharp(refPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).png().toBuffer({resolveWithObject:true});
  const trimHtx = await sharp(htxPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).png().toBuffer({resolveWithObject:true});
  const maxW = Math.max(trimRef.info.width, trimHtx.info.width);
  const maxH = Math.max(trimRef.info.height, trimHtx.info.height);
  const scale = Math.min(MAX/maxW, MAX/maxH, 1);
  const targetW = Math.max(Math.round(maxW*scale), 11);
  const targetH = Math.max(Math.round(maxH*scale), 11);
  const refBuf = await sharp(trimRef.data).resize(targetW,targetH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let htxBuf = await sharp(trimHtx.data).resize(targetW,targetH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const w = refBuf.info.width, h = refBuf.info.height;
  if (htxBuf.info.width!==w || htxBuf.info.height!==h) {
    htxBuf = await sharp(htxBuf.data,{raw:{width:htxBuf.info.width,height:htxBuf.info.height,channels:3}}).resize(w,h,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  }
  return { refBuf, htxBuf, w, h, trimRef, trimHtx };
}

// Largest 4-connected cluster of "bad" windows (below `thr`) in the ssim_map.
function worstCluster(data, mw, mh, thr) {
  const bad = new Uint8Array(mw * mh);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (typeof v === 'number' && v < thr) bad[i] = 1;
  }
  const seen = new Uint8Array(mw * mh);
  let best = null;
  const stack = [];
  for (let s = 0; s < bad.length; s++) {
    if (!bad[s] || seen[s]) continue;
    let area = 0, minV = 1, x0 = mw, y0 = mh, x1 = -1, y1 = -1, sumV = 0;
    stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % mw, y = (i - x) / mw;
      area++; const v = data[i]; if (v < minV) minV = v; sumV += v;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0     && bad[i-1]  && !seen[i-1])  { seen[i-1]=1;  stack.push(i-1); }
      if (x < mw-1  && bad[i+1]  && !seen[i+1])  { seen[i+1]=1;  stack.push(i+1); }
      if (y > 0     && bad[i-mw] && !seen[i-mw]) { seen[i-mw]=1; stack.push(i-mw); }
      if (y < mh-1  && bad[i+mw] && !seen[i+mw]) { seen[i+mw]=1; stack.push(i+mw); }
    }
    if (!best || area > best.area) best = { area, minV, meanV: sumV/area, x0, y0, x1, y1 };
  }
  return best;
}

async function scoreOne(id) {
  const refPng = path.join(TEXER_DIR, id + '.png');
  const htxPng = path.join(HTX_DIR,   id + '.png');
  if (!fs.existsSync(refPng) || !fs.existsSync(htxPng)) return null;
  try {
    const { refBuf, htxBuf, w, h } = await prep(refPng, htxPng);
    // Light blur (matches render-and-score's softA pass) BEFORE windowed SSIM.
    // Thin-line raster offsets (1px) wash out under this blur, killing the
    // line-graph false positives; a real localized bug (wrong glyph, missing
    // element, mis-shade) survives it. This is the whole reason a globally-good
    // diagram can still expose a localized fault.
    const minDim = Math.min(w, h);
    const sigma = Math.min(Math.max(minDim*0.025, 1.5), 4);
    const rB = await sharp(refBuf.data,{raw:{width:w,height:h,channels:3}}).blur(sigma).raw().toBuffer();
    const hB = await sharp(htxBuf.data,{raw:{width:w,height:h,channels:3}}).blur(sigma).raw().toBuffer();
    const refImg = { data: rgbToRgba(rB, w, h), width: w, height: h };
    const htxImg = { data: rgbToRgba(hB, w, h), width: w, height: h };
    const { mssim, ssim_map } = computeSSIM(refImg, htxImg);
    const data = ssim_map.data, mw = ssim_map.width, mh = ssim_map.height;
    const mapTotal = data.length || 1;
    const thr = Math.min(BAD_CEIL, Math.max(BAD_FLOOR, mssim - REL_DROP));
    let minWin = 1, nBad = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (typeof v !== 'number') continue;
      if (v < minWin) minWin = v;
      if (v < thr) nBad++;
    }
    const cl = worstCluster(data, mw, mh, thr);
    const pBad = mapTotal ? nBad / mapTotal : 0;
    // gap = how far the worst cluster falls below the (blurred) global mean.
    // A globally-good diagram with a deep cluster has a LARGE gap = surprising =
    // likely a real localized bug. AA-noise lowers the mean too, so its gap stays
    // small. Area is a mild weight (sqrt) only, and capped: whole-image diffs are
    // routed to a separate "broad" bucket rather than dominating the localized one.
    let clusterArea = 0, clusterMin = 1, clusterFrac = 0, gap = 0, severity = 0, broad = false, clusterFracBox = null;
    if (cl && cl.area >= MIN_AREA) {
      clusterArea = cl.area; clusterMin = cl.minV; clusterFrac = cl.area / mapTotal;
      gap = Math.max(0, mssim - cl.minV);
      broad = clusterFrac > AREA_CAP;
      severity = +(gap * Math.sqrt(Math.min(cl.area, AREA_CAP*mapTotal))).toFixed(3);
      clusterFracBox = [ cl.x0/mw, cl.y0/mh, (cl.x1+1)/mw, (cl.y1+1)/mh ];
    }
    return { id, mssimBlur: +mssim.toFixed(4), minWin: +minWin.toFixed(4),
             pBad: +pBad.toFixed(4), clusterArea, clusterFrac: +clusterFrac.toFixed(3),
             clusterMin: +clusterMin.toFixed(4), gap: +gap.toFixed(4), severity,
             broad, clusterFracBox, mapW: mw, mapH: mh };
  } catch (e) {
    return { id, err: String((e && e.message) || e).slice(0, 120) };
  }
}

// crop a trimmed PNG buffer at a fractional bbox (+margin) → 240px thumb file
async function cropFrac(pngBuf, box, margin, outPath) {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width, H = meta.height;
  const mx = (box[2]-box[0]) * margin + 0.04, my = (box[3]-box[1]) * margin + 0.04;
  let l = Math.floor((box[0]-mx)*W), t = Math.floor((box[1]-my)*H);
  let r = Math.ceil((box[2]+mx)*W),  b = Math.ceil((box[3]+my)*H);
  l = Math.max(0,l); t = Math.max(0,t); r = Math.min(W, Math.max(l+1,r)); b = Math.min(H, Math.max(t+1,b));
  await sharp(pngBuf).extract({left:l, top:t, width:r-l, height:b-t})
    .resize({width:240,height:240,fit:'inside',withoutEnlargement:false})
    .flatten({background:'#fff'}).png().toFile(outPath);
}
async function thumb(pngBuf, outPath) {
  await sharp(pngBuf).resize({width:150,height:150,fit:'inside'}).flatten({background:'#fff'}).png().toFile(outPath);
}

async function pool(items, fn, conc, onDone) {
  let idx = 0, done = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({length: Math.min(conc, items.length)}, async () => {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await fn(items[my], my);
      done++;
      if (onDone && done % 200 === 0) onDone(done, items.length);
    }
  }));
  return results;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function main() {
  const ssimList = fs.existsSync(SSIM_FILE) ? JSON.parse(fs.readFileSync(SSIM_FILE,'utf8')) : [];
  const meta = new Map();
  for (const r of ssimList) meta.set(r.id, { combined: r.combined, ssim: r.ssim, corpusFile: r.corpusFile || '' });

  const randSet = new Set(fs.existsSync(RAND_FILE) ? JSON.parse(fs.readFileSync(RAND_FILE,'utf8')) : []);
  let dropSet = new Set();
  try { if (fs.existsSync(DROP_FILE)) dropSet = new Set(JSON.parse(fs.readFileSync(DROP_FILE,'utf8')).map(x=>String(x).padStart(5,'0'))); } catch {}

  function coll(corpusFile){
    const m = corpusFile.match(/^(c\d+)_/); if (m) return m[1];
    if (corpusFile.startsWith('gallery_')) { const g = corpusFile.match(/^gallery_([A-Za-z0-9]+)_/); return g ? 'gallery_'+g[1] : 'gallery'; }
    return 'unknown';
  }

  // worklist
  let ids = ssimList.map(r => r.id);
  if (ONLY) { const set = new Set(ONLY.map(s=>s.padStart(5,'0'))); ids = ids.filter(id => set.has(id)); }
  ids = ids.filter(id => !randSet.has(id) && !dropSet.has(id));
  if (COLL) ids = ids.filter(id => coll((meta.get(id)||{}).corpusFile||'').startsWith(COLL));
  ids = ids.filter(id => fs.existsSync(path.join(TEXER_DIR,id+'.png')) && fs.existsSync(path.join(HTX_DIR,id+'.png')));
  if (ids.length > LIMIT) ids = ids.slice(0, LIMIT);

  console.log(`Scoring ${ids.length} diagrams (thr=mean-${REL_DROP} in [${BAD_FLOOR},${BAD_CEIL}], conc=${CONC})${COLL?` collection~${COLL}`:''}${ONLY?` ids=${ONLY.length}`:''}…`);
  const t0 = Date.now();
  const recs = (await pool(ids, scoreOne, CONC, (d,n) => process.stdout.write(`\r  ${d}/${n}`))).filter(Boolean);
  process.stdout.write('\n');
  console.log(`Scored ${recs.length} in ${((Date.now()-t0)/1000).toFixed(0)}s`);

  // attach collection + global combined, sort by severity desc
  for (const r of recs) { const m = meta.get(r.id)||{}; r.combined = m.combined ?? null; r.collection = coll(m.corpusFile||''); r.corpusFile = m.corpusFile||''; }
  recs.sort((a,b) => (b.severity||0) - (a.severity||0));
  fs.writeFileSync(OUT_JSON, JSON.stringify(recs, null, 1));
  console.log(`Wrote ${OUT_JSON}`);

  // "hidden" bugs = globally good (high combined) but with a deep local cluster.
  // Localized = compact cluster (the prize). Broad = whole-image diff that the
  // pipeline's blur-max rescued into a high mean (worth a separate look).
  const goodGate = r => !r.err && r.clusterFracBox && (r.combined ?? 1) >= MIN_GOOD && r.severity > 0;
  const localized = recs.filter(r => goodGate(r) && !r.broad).slice(0, TOPN);
  const broad     = recs.filter(r => goodGate(r) &&  r.broad).sort((a,b)=>(b.gap||0)-(a.gap||0)).slice(0, Math.min(120, TOPN));
  const gallery = localized.concat(broad);
  console.log(`Candidates (combined>=${MIN_GOOD}): localized ${localized.length}, broad ${broad.length}`);

  if (!NO_CROPS && gallery.length) {
    fs.mkdirSync(CROP_DIR, { recursive: true });
    let made = 0;
    await pool(gallery, async (r) => {
      try {
        const { trimRef, trimHtx } = await prep(path.join(TEXER_DIR,r.id+'.png'), path.join(HTX_DIR,r.id+'.png'));
        await cropFrac(trimRef.data, r.clusterFracBox, 0.6, path.join(CROP_DIR, r.id+'_ref.png'));
        await cropFrac(trimHtx.data, r.clusterFracBox, 0.6, path.join(CROP_DIR, r.id+'_htx.png'));
        await thumb(trimRef.data, path.join(CROP_DIR, r.id+'_reft.png'));
        await thumb(trimHtx.data, path.join(CROP_DIR, r.id+'_htxt.png'));
      } catch (e) { r.cropErr = String(e.message||e).slice(0,80); }
      made++;
      if (made % 50 === 0) process.stdout.write(`\r  crops ${made}/${gallery.length}`);
    }, CONC);
    process.stdout.write('\n');
  }

  // HTML
  const card = r => `
    <div class="card">
      <div class="hd"><b>${r.id}</b> <span class="c">${esc(r.collection)}</span>
        <span class="m">sev ${r.severity}</span><span class="m">gap ${r.gap}</span><span class="m">clusterMin ${r.clusterMin}</span>
        <span class="m">area ${r.clusterArea} (${(r.clusterFrac*100).toFixed(0)}%)</span>
        <span class="m">combined ${r.combined==null?'?':r.combined.toFixed(4)}</span>
        <a href="blink.html#${r.id}" target="_blank">open</a>
        <span class="src">${esc(r.corpusFile)}</span></div>
      <div class="crops">
        <figure><img src="localized_crops/${r.id}_ref.png"><figcaption>TeXeR (worst region)</figcaption></figure>
        <figure><img src="localized_crops/${r.id}_htx.png"><figcaption>HiTeXeR (worst region)</figcaption></figure>
        <figure><img src="localized_crops/${r.id}_reft.png" class="t"><figcaption>ref full</figcaption></figure>
        <figure><img src="localized_crops/${r.id}_htxt.png" class="t"><figcaption>htx full</figcaption></figure>
      </div>
    </div>`;

  const html = `<!doctype html><meta charset="utf-8"><title>Localized review — worst-cluster crops</title>
<style>
  body{background:#111;color:#ddd;font:13px/1.4 system-ui,sans-serif;margin:0;padding:16px}
  h1{font-size:16px} h2{font-size:14px;color:#fc6;border-top:1px solid #333;padding-top:14px;margin-top:24px}
  .sub{color:#888;margin:4px 0 16px}
  .card{background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:10px;margin:0 0 14px}
  .hd{margin-bottom:8px} .hd b{color:#fff;font-size:15px}
  .c{color:#6cf;margin-left:6px} .m{color:#9a9;margin-left:10px} .src{color:#666;margin-left:10px}
  .hd a{color:#fc6;margin-left:10px}
  .crops{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0;text-align:center} figcaption{color:#888;font-size:11px;margin-top:3px}
  img{background:#fff;border:1px solid #444;border-radius:4px;display:block}
  img.t{width:150px}
</style>
<h1>Localized review — ${localized.length} localized + ${broad.length} broad candidates</h1>
<div class="sub">"Globally good but locally bad": combined&nbsp;&ge;&nbsp;${MIN_GOOD}, scored on a light-blur pass (so thin-line raster noise washes out), ranked by gap (mean&minus;worstCluster) &times; &radic;area.
Skim the first two images of each row — if they differ structurally it's a likely HiTeXeR bug; if they look the same it's an AA/trim artifact.</div>
<h2>Localized (compact cluster &lt; ${(AREA_CAP*100).toFixed(0)}% of image) — the prize</h2>
${localized.map(card).join('\n')}
<h2>Broad (whole-image disagreement rescued by the blur-max mean) — sizing/systematic suspects</h2>
${broad.map(card).join('\n')}
`;
  fs.writeFileSync(OUT_HTML, html);
  console.log(`Wrote ${OUT_HTML}  (${localized.length} localized + ${broad.length} broad)`);
  console.log(`\nTop 25 localized by severity (globally good):`);
  for (const r of localized.slice(0,25)) {
    console.log(`  ${r.id}  sev ${String(r.severity).padStart(6)}  gap ${r.gap}  clMin ${String(r.clusterMin).padStart(7)}  area ${String(r.clusterArea).padStart(4)} (${(r.clusterFrac*100).toFixed(0)}%)  comb ${r.combined==null?'?':r.combined.toFixed(4)}  ${r.collection}  ${r.corpusFile}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
