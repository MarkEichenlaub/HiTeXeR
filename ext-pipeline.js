'use strict';
/**
 * ext-pipeline.js
 *
 * Render → rasterize → TeXeR-fetch → SSIM → manifest for the EXTERNAL-source
 * collections (asy_corpus_ext/, string ids like ext_tutorial_intro). Mirrors the
 * corpus pipeline (recompute-htx + ssim-pipeline) but operates ONLY on ext ids,
 * so it never touches asy_corpus's positional numeric ids or their texer_pngs.
 *
 * Steps (default: all): render rasterize fetch ssim manifest
 *   render    asy_corpus_ext/<id>.asy → comparison/asy_src/<id>.asy + htx_svgs/<id>.svg
 *   rasterize htx_svgs/<id>.svg → htx_pngs/<id>.png  (Blink, same as the corpus)
 *   fetch     TeXeR PNG via refetch-single.py → texer_pngs/<id>.png  (parallel)
 *   ssim      combined = mssim*sizeScore → merged into ssim-results.json
 *   manifest  regenerate blink-manifest.json (picks up ext:* collections)
 *
 * Usage:
 *   node ext-pipeline.js                 # all steps
 *   node ext-pipeline.js render rasterize
 *   node ext-pipeline.js fetch --workers 4 --refetch
 *   node ext-pipeline.js ssim manifest
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT      = __dirname;
const EXT_DIR   = path.join(ROOT, 'asy_corpus_ext');
const COMP      = path.join(ROOT, 'comparison');
const ASY_SRC   = path.join(COMP, 'asy_src');
const SVG_DIR   = path.join(COMP, 'htx_svgs');
const HTX_DIR   = path.join(COMP, 'htx_pngs');
const TEXER_DIR = path.join(COMP, 'texer_pngs');
const SSIM_FILE = path.join(COMP, 'ssim-results.json');
const MANIFEST_SCRIPT = path.join(COMP, 'generate-manifest.js');

const SIGMA = 0.15, MAX_DIM = 400;

const argv = process.argv.slice(2);
const stepArgs = argv.filter(a => !a.startsWith('--'));
const STEPS = new Set(stepArgs.length ? stepArgs : ['render', 'rasterize', 'fetch', 'ssim', 'manifest']);
function flag(name, def) { const i = argv.indexOf('--' + name); if (i < 0) return def; const v = argv[i+1]; return (v===undefined||v.startsWith('--'))?true:v; }
const WORKERS  = flag('workers') ? parseInt(flag('workers'),10) : 4;
const REFETCH  = !!flag('refetch');           // re-fetch even if texer png exists
const RERENDER = !!flag('rerender');          // re-render even if svg exists

for (const d of [ASY_SRC, SVG_DIR, HTX_DIR, TEXER_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

if (!fs.existsSync(EXT_DIR)) { console.error(`No ${EXT_DIR} — nothing to do. Extract ext sources there first.`); process.exit(0); }
const extFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.asy')).sort();
const extIds = extFiles.map(f => f.replace(/\.asy$/, ''));
console.log(`ext-pipeline: ${extIds.length} external diagram(s) [steps: ${[...STEPS].join(' ')}]`);

// expandViewBox — copied verbatim from recompute-htx.js / ssim-pipeline.js so the
// rasterized canvas matches the corpus exactly.
function expandViewBox(svgStr) {
  if (svgStr.indexOf('clip-path="url(#user-clip)"') !== -1) return svgStr;
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/);
  if (!vbMatch) return svgStr;
  let [vx, vy, vw, vh] = vbMatch[1].split(/\s+/).map(Number);
  let minX = vx, minY = vy, maxX = vx + vw, maxY = vy + vh;
  const hasClip = /<clipPath\s/.test(svgStr);
  const textRe  = /<text\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?(?:font-size="([^"]+)")?[^>]*>/g;
  const textRe2 = /<text\s[^>]*?\by="([^"]+)"[^>]*?\bx="([^"]+)"[^>]*?(?:font-size="([^"]+)")?[^>]*>/g;
  for (const re of [textRe, textRe2]) {
    let m;
    while ((m = re.exec(svgStr)) !== null) {
      const x = parseFloat(re === textRe ? m[1] : m[2]);
      const y = parseFloat(re === textRe ? m[2] : m[1]);
      const fsz = parseFloat(m[3] || '12');
      const pad = fsz * 0.6;
      if (hasClip && (x + pad < vx || x - pad > vx + vw || y + pad < vy || y - pad > vy + vh)) continue;
      if (x - pad < minX) minX = x - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y - pad < minY) minY = y - pad;
      if (y + pad > maxY) maxY = y + pad;
    }
  }
  const foRe = /<foreignObject\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?\bwidth="([^"]+)"[^>]*?\bheight="([^"]+)"[^>]*>/g;
  let fm;
  while ((fm = foRe.exec(svgStr)) !== null) {
    const fx = parseFloat(fm[1]), fy = parseFloat(fm[2]), fw = parseFloat(fm[3]), fh = parseFloat(fm[4]);
    if (hasClip && (fx + fw < vx || fx > vx + vw || fy + fh < vy || fy > vy + vh)) continue;
    if (fx < minX) minX = fx; if (fy < minY) minY = fy;
    if (fx + fw > maxX) maxX = fx + fw; if (fy + fh > maxY) maxY = fy + fh;
  }
  const newVx = Math.min(vx, minX), newVy = Math.min(vy, minY);
  const newVw = Math.max(vx + vw, maxX) - newVx, newVh = Math.max(vy + vh, maxY) - newVy;
  if (newVx === vx && newVy === vy && newVw === vw && newVh === vh) return svgStr;
  const fmt = n => +n.toFixed(4);
  let result = svgStr.replace(vbMatch[0], `viewBox="${fmt(newVx)} ${fmt(newVy)} ${fmt(newVw)} ${fmt(newVh)}"`);
  const wMatch = result.match(/\bwidth="([^"]+)"/), hMatch = result.match(/\bheight="([^"]+)"/);
  if (wMatch && hMatch) {
    const oldW = parseFloat(wMatch[1]), oldH = parseFloat(hMatch[1]);
    result = result.replace(wMatch[0], `width="${fmt(oldW*(newVw/vw))}"`);
    result = result.replace(hMatch[0], `height="${fmt(oldH*(newVh/vh))}"`);
  }
  return result;
}
function rgbToRgba(buf, w, h) {
  const out = new Uint8ClampedArray(w*h*4);
  for (let i=0;i<w*h;i++){ out[i*4]=buf[i*3]; out[i*4+1]=buf[i*3+1]; out[i*4+2]=buf[i*3+2]; out[i*4+3]=255; }
  return out;
}

async function stepRender() {
  console.log('\n[render] HiTeXeR SVGs…');
  global.window = global.window || {};
  global.katex = require('katex');
  require('./asy-interp.js');
  const A = global.window.AsyInterp;
  let ok=0, skip=0, fail=0, cached=0;
  for (const source of extFiles) {
    const id = source.replace(/\.asy$/, '');
    const raw = fs.readFileSync(path.join(EXT_DIR, source), 'utf8');
    fs.writeFileSync(path.join(ASY_SRC, id + '.asy'), raw);   // canonical per-id copy
    const svgPath = path.join(SVG_DIR, id + '.svg');
    if (!RERENDER && fs.existsSync(svgPath)) { cached++; continue; }
    const code = '[asy]\n' + raw + '\n[/asy]';
    if (!A.canInterpret(code)) { skip++; console.log(`  skip (unsupported): ${id}`); continue; }
    try {
      const r = A.render(code, { containerW: 800, containerH: 600 });
      fs.writeFileSync(svgPath, r.svg);
      ok++;
    } catch (e) { fail++; console.log(`  FAIL render ${id}: ${String(e.message||e).slice(0,90)}`); }
  }
  console.log(`  render: ok=${ok} cached=${cached} skip=${skip} fail=${fail}`);
}

async function stepRasterize() {
  console.log('\n[rasterize] Blink → htx_pngs…');
  const blink = require('./blink-raster.js');
  await blink.getBrowser();
  let ok=0, fail=0;
  for (const id of extIds) {
    const sf = path.join(SVG_DIR, id + '.svg');
    if (!fs.existsSync(sf)) continue;
    const outPng = path.join(HTX_DIR, id + '.png');
    if (fs.existsSync(outPng) && fs.statSync(outPng).mtimeMs >= fs.statSync(sf).mtimeMs) { ok++; continue; }
    try {
      let svgStr = fs.readFileSync(sf, 'utf8');
      const iw = svgStr.match(/data-intrinsic-w="([^"]+)"/), ih = svgStr.match(/data-intrinsic-h="([^"]+)"/);
      if (iw && ih) {
        svgStr = svgStr.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${iw[1]}"`);
        svgStr = svgStr.replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`);
      }
      const png = await blink.rasterizeSVG(expandViewBox(svgStr), {});
      await sharp(png).flatten({ background: { r:255, g:255, b:255 } }).png().toFile(outPng);
      ok++;
    } catch (e) { fail++; console.log(`  FAIL raster ${id}: ${String(e.message||e).slice(0,90)}`); }
  }
  await blink.closeBrowser();
  console.log(`  rasterize: ok=${ok} fail=${fail}`);
}

async function stepFetch() {
  console.log(`\n[fetch] TeXeR PNGs (${WORKERS} workers)…`);
  const todo = extIds.filter(id => REFETCH || !fs.existsSync(path.join(TEXER_DIR, id + '.png')));
  console.log(`  ${todo.length} to fetch${REFETCH ? ' (refetch all)' : ''} (${extIds.length - todo.length} already present)`);
  let qi = 0, ok = 0, fail = 0;
  await new Promise(resolve => {
    let active = 0;
    const next = () => {
      while (active < WORKERS && qi < todo.length) {
        const id = todo[qi++]; active++;
        const p = spawn('python', ['comparison/refetch-single.py', id], { cwd: ROOT, windowsHide: true });
        let out = '';
        p.stdout.on('data', d => out += d);
        p.on('close', () => {
          active--;
          let r = {}; try { r = JSON.parse(out.trim() || '{}'); } catch {}
          if (r.ok) { ok++; } else { fail++; console.log(`  texer fail ${id}: ${(r.error||'?').slice(0,80)}`); }
          if ((ok+fail) % 10 === 0) process.stdout.write(`\r  ${ok+fail}/${todo.length}`);
          if (qi >= todo.length && active === 0) { process.stdout.write('\n'); resolve(); }
          else next();
        });
      }
      if (todo.length === 0) resolve();
    };
    next();
  });
  console.log(`  fetch: ok=${ok} fail=${fail}`);
}

async function ssimOne(id) {
  const refPng = path.join(TEXER_DIR, id + '.png'), htxPng = path.join(HTX_DIR, id + '.png');
  const refMeta = await sharp(refPng).metadata(), htxMeta = await sharp(htxPng).metadata();
  const aw=refMeta.width||1, ah=refMeta.height||1, hw=htxMeta.width||1, hh=htxMeta.height||1;
  if (aw<8||ah<8||hw<8||hh<8) return { ssim:-1, sizeScore:-1, combined:-1, error:'Image too small', refDims:[aw,ah], htxDims:[hw,hh] };
  let sizeScore;
  if (aw<100 && ah<100) sizeScore = 1.0;
  else { const maxRatio = Math.max(hw,hh)/Math.max(aw,ah); sizeScore = Math.exp(-((maxRatio-1)**2)/(2*SIGMA*SIGMA)); }
  const trimRef = await sharp(refPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).toBuffer({resolveWithObject:true});
  const trimHtx = await sharp(htxPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).toBuffer({resolveWithObject:true});
  const maxW=Math.max(trimRef.info.width,trimHtx.info.width), maxH=Math.max(trimRef.info.height,trimHtx.info.height);
  const scale=Math.min(MAX_DIM/maxW, MAX_DIM/maxH, 1);
  const tW=Math.max(Math.round(maxW*scale),11), tH=Math.max(Math.round(maxH*scale),11);
  const refBuf = await sharp(trimRef.data).resize(tW,tH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let htxBuf = await sharp(trimHtx.data).resize(tW,tH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const w=refBuf.info.width, h=refBuf.info.height;
  if (htxBuf.info.width!==w||htxBuf.info.height!==h)
    htxBuf = await sharp(htxBuf.data,{raw:{width:htxBuf.info.width,height:htxBuf.info.height,channels:3}}).resize(w,h,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  const { mssim } = computeSSIM({data:rgbToRgba(refBuf.data,w,h),width:w,height:h},{data:rgbToRgba(htxBuf.data,w,h),width:w,height:h});
  return { ssim: mssim, sizeScore, combined: mssim*sizeScore, refDims:[aw,ah], htxDims:[hw,hh] };
}

async function stepSsim() {
  console.log('\n[ssim] scoring ext pairs…');
  const entries = [];
  for (const id of extIds) {
    const source = id + '.asy';
    const base = { id, idx: null, corpusFile: source };
    if (!fs.existsSync(path.join(TEXER_DIR, id+'.png')) || !fs.existsSync(path.join(HTX_DIR, id+'.png'))) {
      entries.push({ ...base, ssim:null, sizeScore:null, combined:null, error:'missing png(s)' });
      continue;
    }
    try { entries.push({ ...base, ...(await ssimOne(id)) }); }
    catch (e) { entries.push({ ...base, ssim:-1, sizeScore:-1, combined:-1, error:String(e.message||e).slice(0,100) }); }
  }
  // Merge: drop any prior ext_* rows, append the fresh ones. Corpus rows untouched.
  let all = [];
  try { all = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf8')); } catch {}
  all = all.filter(r => !(r.id && String(r.id).startsWith('ext_')));
  all = all.concat(entries);
  fs.writeFileSync(SSIM_FILE, JSON.stringify(all, null, 2));
  const scored = entries.filter(e => typeof e.combined === 'number' && e.combined >= 0);
  scored.sort((a,b)=>a.combined-b.combined);
  console.log(`  ssim: wrote ${entries.length} ext rows (merged, ${all.length} total).`);
  console.log('  Worst 12 ext:');
  for (const r of scored.slice(0,12)) console.log(`    ${r.id}  combined=${r.combined.toFixed(4)} ssim=${r.ssim.toFixed(4)} size=${r.sizeScore.toFixed(4)}`);
  const missing = entries.filter(e => e.error);
  if (missing.length) console.log(`  ${missing.length} ext with no score (render/fetch gap): ${missing.slice(0,10).map(m=>m.id).join(', ')}${missing.length>10?'…':''}`);
}

function stepManifest() {
  console.log('\n[manifest] regenerating blink-manifest.json…');
  execSync(`node "${MANIFEST_SCRIPT}"`, { stdio: 'inherit', cwd: ROOT });
}

(async () => {
  if (STEPS.has('render'))    await stepRender();
  if (STEPS.has('rasterize')) await stepRasterize();
  if (STEPS.has('fetch'))     await stepFetch();
  if (STEPS.has('ssim'))      await stepSsim();
  if (STEPS.has('manifest'))  stepManifest();
  console.log('\next-pipeline: done.');
})().catch(e => { console.error(e); process.exit(1); });
