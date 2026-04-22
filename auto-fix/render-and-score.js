// auto-fix/render-and-score.js
// Render + SSIM-score a user-specified list of diagram IDs.
// Adapted from _rerun_targets.js (lines 25-188), generalized to accept IDs from:
//   --ids A,B,C          explicit comma-separated list
//   --canary             read auto-fix/canary.json
//   --family <prefix>    all IDs whose corpusFile starts with "<prefix>_" (e.g. c10_L21)
//   (stdin, newline)     if no ID flag given
// Multiple flags may be combined; IDs are deduplicated.
//
// Emits one JSON object per ID to stdout (newline-separated), then a final
// summary line: {"summary": {...}}.
// Exit 0 if no ID dropped > 0.05 vs its baseline; exit 1 if any did; exit 2 on usage error.
'use strict';

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT        = path.resolve(__dirname, '..');
const OUT_DIR     = path.join(ROOT, 'comparison');
const ASY_SRC_DIR = path.join(OUT_DIR, 'asy_src');
const SVG_DIR     = path.join(OUT_DIR, 'htx_svgs');
const HTX_DIR     = path.join(OUT_DIR, 'htx_pngs');
const TEXER_DIR   = path.join(OUT_DIR, 'texer_pngs');
const SSIM_RESULTS_PATH = path.join(OUT_DIR, 'ssim-results.json');
const CANARY_PATH = path.join(__dirname, 'canary.json');
const RASTER_DPI  = 144;
const REGRESSION_THRESHOLD = 0.05;
const KATEX_FONTS_DIR = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');

// ── CLI parsing ────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { ids: [], canary: false, family: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids')     { out.ids = out.ids.concat((argv[++i] || '').split(',').filter(Boolean)); }
    else if (a === '--canary') out.canary = true;
    else if (a === '--family') out.family = argv[++i] || '';
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error('unknown arg: ' + a); out.help = true; }
  }
  return out;
}

function usage() {
  console.error('usage: node auto-fix/render-and-score.js [--ids A,B,C] [--canary] [--family c10_L21]');
  console.error('       echo "04484\\n05896" | node auto-fix/render-and-score.js');
}

// ── Font face CSS (identical to ssim-pipeline / _rerun_targets) ─
function buildFontFaceCSS() {
  const faces = [
    { family:'KaTeX_Main', style:'normal', weight:'normal', file:'KaTeX_Main-Regular.woff2' },
    { family:'KaTeX_Main', style:'italic', weight:'normal', file:'KaTeX_Main-Italic.woff2' },
    { family:'KaTeX_Main', style:'normal', weight:'bold',   file:'KaTeX_Main-Bold.woff2' },
    { family:'KaTeX_Main', style:'italic', weight:'bold',   file:'KaTeX_Main-BoldItalic.woff2' },
    { family:'KaTeX_Math', style:'normal', weight:'normal', file:'KaTeX_Math-Italic.woff2' },
    { family:'KaTeX_Math', style:'italic', weight:'normal', file:'KaTeX_Math-Italic.woff2' },
    { family:'KaTeX_Math', style:'normal', weight:'bold',   file:'KaTeX_Math-BoldItalic.woff2' },
    { family:'KaTeX_Math', style:'italic', weight:'bold',   file:'KaTeX_Math-BoldItalic.woff2' },
  ];
  let css = '';
  for (const f of faces) {
    const p = path.join(KATEX_FONTS_DIR, f.file);
    if (!fs.existsSync(p)) continue;
    const b64 = fs.readFileSync(p).toString('base64');
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  return css;
}
function embedFontsInSVG(svgStr, css) {
  if (svgStr.includes('<style>')) return svgStr.replace('<style>', '<style>' + css);
  return svgStr.replace(/(^<svg[^>]*>)/, '$1<style>' + css + '</style>');
}
function expandViewBox(svgStr) {
  const vb = svgStr.match(/viewBox="([^"]+)"/);
  if (!vb) return svgStr;
  let [vx,vy,vw,vh] = vb[1].split(/\s+/).map(Number);
  let minX=vx, minY=vy, maxX=vx+vw, maxY=vy+vh;
  const textTagRe = /<text\s[^>]*>/g;
  let m;
  while ((m=textTagRe.exec(svgStr))!==null) {
    const t=m[0];
    const xM=t.match(/\bx="([^"]+)"/), yM=t.match(/\by="([^"]+)"/), fsM=t.match(/\bfont-size="([^"]+)"/);
    if (!xM||!yM) continue;
    const x=parseFloat(xM[1]), y=parseFloat(yM[1]), fs=parseFloat(fsM?fsM[1]:'12'), pad=fs*0.6;
    if (x-pad<minX) minX=x-pad;
    if (x+pad>maxX) maxX=x+pad;
    if (y-pad<minY) minY=y-pad;
    if (y+pad>maxY) maxY=y+pad;
  }
  const foRe=/<foreignObject\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?\bwidth="([^"]+)"[^>]*?\bheight="([^"]+)"[^>]*>/g;
  let fm;
  while ((fm=foRe.exec(svgStr))!==null) {
    const fx=parseFloat(fm[1]), fy=parseFloat(fm[2]), fw=parseFloat(fm[3]), fh=parseFloat(fm[4]);
    if (fx<minX) minX=fx; if (fy<minY) minY=fy;
    if (fx+fw>maxX) maxX=fx+fw; if (fy+fh>maxY) maxY=fy+fh;
  }
  const nx=Math.min(vx,minX), ny=Math.min(vy,minY);
  const nw=Math.max(vx+vw,maxX)-nx, nh=Math.max(vy+vh,maxY)-ny;
  if (nx===vx && ny===vy && nw===vw && nh===vh) return svgStr;
  const fmt=n=>+n.toFixed(4);
  let r=svgStr.replace(vb[0], `viewBox="${fmt(nx)} ${fmt(ny)} ${fmt(nw)} ${fmt(nh)}"`);
  const wM=r.match(/\bwidth="([^"]+)"/), hM=r.match(/\bheight="([^"]+)"/);
  if (wM && hM) {
    const oldW=parseFloat(wM[1]), oldH=parseFloat(hM[1]);
    r=r.replace(wM[0], `width="${fmt(oldW*(nw/vw))}"`);
    r=r.replace(hM[0], `height="${fmt(oldH*(nh/vh))}"`);
  }
  return r;
}
function rgbToRgba(buf, w, h) {
  const out = new Uint8ClampedArray(w*h*4);
  for (let i=0;i<w*h;i++){ out[i*4]=buf[i*3]; out[i*4+1]=buf[i*3+1]; out[i*4+2]=buf[i*3+2]; out[i*4+3]=255; }
  return out;
}

// ── Score one diagram ID ────────────────────────────────────────
async function scoreOne(id, A, fontCSS) {
  const asyPath = path.join(ASY_SRC_DIR, id + '.asy');
  if (!fs.existsSync(asyPath)) return { id, err: 'no asy_src' };
  const raw = fs.readFileSync(asyPath, 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';

  let svg;
  try {
    const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
    svg = r.svg;
    fs.writeFileSync(path.join(SVG_DIR, id + '.svg'), svg);
  } catch (e) {
    return { id, err: 'htx-render: ' + e.message.substring(0,120) };
  }

  const iw = svg.match(/data-intrinsic-w="([^"]+)"/);
  const ih = svg.match(/data-intrinsic-h="([^"]+)"/);
  if (iw && ih) {
    svg = svg.replace(/(<svg[^>]*)\bwidth="[^"]*"/,  `$1width="${iw[1]}"`);
    svg = svg.replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`);
  }
  const svgBuf = Buffer.from(embedFontsInSVG(expandViewBox(svg), fontCSS), 'utf8');
  const htxPng = path.join(HTX_DIR, id + '.png');
  try {
    await sharp(svgBuf, { density: RASTER_DPI }).flatten({ background:{r:255,g:255,b:255} }).png().toFile(htxPng);
  } catch (e) {
    return { id, err: 'rasterize: ' + e.message.substring(0,120) };
  }

  const refPng = path.join(TEXER_DIR, id + '.png');
  if (!fs.existsSync(refPng)) return { id, err: 'no texer ref' };

  try {
    const refMeta = await sharp(refPng).metadata();
    const htxMeta = await sharp(htxPng).metadata();
    const aw=refMeta.width||1, ah=refMeta.height||1, hw=htxMeta.width||1, hh=htxMeta.height||1;

    const SIGMA=0.15;
    let sizeScore;
    if (aw<100 && ah<100) sizeScore=1.0;
    else {
      const maxRatio = Math.max(hw,hh) / Math.max(aw,ah);
      sizeScore = Math.exp(-((maxRatio-1)**2)/(2*SIGMA*SIGMA));
    }

    const MAX=400;
    const trimRef = await sharp(refPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).toBuffer({resolveWithObject:true});
    const trimHtx = await sharp(htxPng).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).toBuffer({resolveWithObject:true});
    const maxW = Math.max(trimRef.info.width, trimHtx.info.width);
    const maxH = Math.max(trimRef.info.height, trimHtx.info.height);
    const scale = Math.min(MAX/maxW, MAX/maxH, 1);
    const targetW = Math.max(Math.round(maxW*scale), 11);
    const targetH = Math.max(Math.round(maxH*scale), 11);

    const refBuf = await sharp(trimRef.data).resize(targetW,targetH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let htxBuf = await sharp(trimHtx.data).resize(targetW,targetH,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const w=refBuf.info.width, h=refBuf.info.height;
    if (htxBuf.info.width!==w || htxBuf.info.height!==h) {
      htxBuf = await sharp(htxBuf.data,{raw:{width:htxBuf.info.width,height:htxBuf.info.height,channels:3}}).resize(w,h,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
    }
    const refImg={data:rgbToRgba(refBuf.data,w,h),width:w,height:h};
    const htxImg={data:rgbToRgba(htxBuf.data,w,h),width:w,height:h};
    const { mssim: rawSsim } = computeSSIM(refImg, htxImg);

    const minDim = Math.min(w,h);
    const softA = Math.min(Math.max(minDim*0.025,1.5),4);
    const softB = Math.min(Math.max(minDim*0.08,3),10);
    async function blurSSIM(sigma){
      const rS = await sharp(refBuf.data,{raw:{width:w,height:h,channels:3}}).blur(sigma).raw().toBuffer();
      const hS = await sharp(htxBuf.data,{raw:{width:w,height:h,channels:3}}).blur(sigma).raw().toBuffer();
      return computeSSIM({data:rgbToRgba(rS,w,h),width:w,height:h},{data:rgbToRgba(hS,w,h),width:w,height:h}).mssim;
    }
    const sA=await blurSSIM(softA), sB=await blurSSIM(softB);
    const mssim = Math.max(rawSsim, sA, sB);
    const combined = mssim * sizeScore;

    return { id, ssim: mssim, sizeScore, combined };
  } catch (e) {
    return { id, err: 'ssim: ' + e.message.substring(0,120) };
  }
}

// ── ID collection ──────────────────────────────────────────────
function loadSsimResults() {
  if (!fs.existsSync(SSIM_RESULTS_PATH)) return { list: [], byId: new Map() };
  const list = JSON.parse(fs.readFileSync(SSIM_RESULTS_PATH, 'utf8'));
  const byId = new Map();
  for (const row of list) byId.set(row.id, row);
  return { list, byId };
}
function loadCanary() {
  if (!fs.existsSync(CANARY_PATH)) return {};
  return JSON.parse(fs.readFileSync(CANARY_PATH, 'utf8'));
}

function readStdinSync() {
  try {
    const data = fs.readFileSync(0, 'utf8');
    return data.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(2); }

  const { byId } = loadSsimResults();
  const canaryMap = args.canary ? loadCanary() : {};

  // Collect IDs
  const idSet = new Set();
  for (const id of args.ids) idSet.add(id);
  if (args.canary) for (const id of Object.keys(canaryMap)) idSet.add(id);
  if (args.family) {
    const prefix = args.family + '_';
    for (const row of byId.values()) {
      if (row.corpusFile && row.corpusFile.startsWith(prefix)) idSet.add(row.id);
    }
  }
  // stdin only if no flags gave us IDs
  if (idSet.size === 0 && !process.stdin.isTTY) {
    for (const id of readStdinSync()) idSet.add(id);
  }

  if (idSet.size === 0) {
    console.error('no IDs provided');
    usage();
    process.exit(2);
  }

  // Load interpreter
  global.window = global.window || {};
  global.katex = require('katex');
  require(path.join(ROOT, 'asy-interp.js'));
  const A = global.window.AsyInterp;

  const fontCSS = buildFontFaceCSS();
  const ids = [...idSet].sort();

  let worstDelta = 0;            // most negative delta across all scored IDs
  let worstCanaryDelta = 0;      // most negative among canary-baselined IDs
  let worstFamilyDelta = 0;      // most negative among family IDs (uses ssim-results baseline)
  let worstId = null;
  let errors = 0, scored = 0;
  const familyPrefix = args.family ? args.family + '_' : null;

  for (const id of ids) {
    const row = await scoreOne(id, A, fontCSS);
    if (row.err) { errors++; console.log(JSON.stringify(row)); continue; }
    // Baseline selection: canary.json overrides ssim-results.json when applicable.
    let pre = null, baselineSource = null;
    if (canaryMap[id] != null) { pre = canaryMap[id]; baselineSource = 'canary'; }
    else if (byId.has(id))     { pre = byId.get(id).ssim; baselineSource = 'ssim-results'; }
    const delta = (pre != null) ? row.ssim - pre : null;
    const out = { id: row.id, ssim: row.ssim, sizeScore: row.sizeScore, combined: row.combined, pre, delta, baselineSource };
    console.log(JSON.stringify(out));
    scored++;
    if (delta != null && delta < worstDelta) { worstDelta = delta; worstId = id; }
    if (baselineSource === 'canary' && delta != null && delta < worstCanaryDelta) worstCanaryDelta = delta;
    if (familyPrefix && byId.get(id) && byId.get(id).corpusFile && byId.get(id).corpusFile.startsWith(familyPrefix)) {
      if (delta != null && delta < worstFamilyDelta) worstFamilyDelta = delta;
    }
  }

  const regression = worstDelta < -REGRESSION_THRESHOLD;
  const summary = {
    summary: {
      total: ids.length, scored, errors,
      worstDelta, worstId,
      worstCanaryDelta, worstFamilyDelta,
      regression,
      threshold: REGRESSION_THRESHOLD
    }
  };
  console.log(JSON.stringify(summary));
  process.exit(regression ? 1 : 0);
}

main().catch(e => { console.error(e && e.stack || e); process.exit(3); });
