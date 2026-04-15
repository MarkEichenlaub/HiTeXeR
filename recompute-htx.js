'use strict';
/**
 * recompute-htx.js
 *
 * Renders HiTeXeR SVGs from comparison/asy_src/, rasterizes to htx_pngs/,
 * recomputes SSIM vs asy_pngs/, and regenerates ssim-results.json + HTML.
 *
 * Usage:
 *   node recompute-htx.js [render-htx] [rasterize] [ssim] [html]
 *   (default: all four steps)
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT       = __dirname;
const ASY_SRC    = path.join(ROOT, 'comparison', 'asy_src');
const SVG_DIR    = path.join(ROOT, 'comparison', 'htx_svgs');
const HTX_DIR    = path.join(ROOT, 'comparison', 'htx_pngs');
const ASY_DIR    = path.join(ROOT, 'comparison', 'asy_pngs');
const OUT_DIR    = path.join(ROOT, 'comparison');
const SSIM_FILE  = path.join(OUT_DIR, 'ssim-results.json');
const RASTER_DPI = 144;   // matches ssim-pipeline.js
const SIGMA      = 0.15;
const MAX_DIM    = 400;
const PER_PAGE   = 100;

const requestedSteps = process.argv.slice(2);
const STEPS = new Set(
  requestedSteps.length ? requestedSteps : ['render-htx', 'rasterize', 'ssim', 'html']
);

for (const d of [SVG_DIR, HTX_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Load old corpusFile mapping so we preserve it after recompute ─────────
let corpusFileMap = {};  // id -> corpusFile
if (fs.existsSync(SSIM_FILE)) {
  try {
    const old = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf8'));
    for (const r of old) {
      if (r.id && r.corpusFile) corpusFileMap[r.id] = r.corpusFile;
    }
    console.log(`Loaded ${Object.keys(corpusFileMap).length} id->corpusFile mappings from ssim-results.json`);
  } catch (e) {
    console.warn('Could not load existing ssim-results.json:', e.message);
  }
}

// ── KaTeX font embedding ──────────────────────────────────────────────────
const KATEX_FONTS_DIR = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');

function buildFontFaceCSS() {
  const faces = [
    { family: 'KaTeX_Main', style: 'normal', weight: 'normal', file: 'KaTeX_Main-Regular.woff2' },
    { family: 'KaTeX_Main', style: 'italic', weight: 'normal', file: 'KaTeX_Main-Italic.woff2' },
    { family: 'KaTeX_Main', style: 'normal', weight: 'bold',   file: 'KaTeX_Main-Bold.woff2' },
    { family: 'KaTeX_Main', style: 'italic', weight: 'bold',   file: 'KaTeX_Main-BoldItalic.woff2' },
    { family: 'KaTeX_Math', style: 'normal', weight: 'normal', file: 'KaTeX_Math-Italic.woff2' },
    { family: 'KaTeX_Math', style: 'italic', weight: 'normal', file: 'KaTeX_Math-Italic.woff2' },
    { family: 'KaTeX_Math', style: 'normal', weight: 'bold',   file: 'KaTeX_Math-BoldItalic.woff2' },
    { family: 'KaTeX_Math', style: 'italic', weight: 'bold',   file: 'KaTeX_Math-BoldItalic.woff2' },
  ];
  let css = '';
  for (const f of faces) {
    const fp = path.join(KATEX_FONTS_DIR, f.file);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  return css;
}

function expandViewBox(svgStr) {
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/);
  if (!vbMatch) return svgStr;
  let [vx, vy, vw, vh] = vbMatch[1].split(/\s+/).map(Number);
  let minX = vx, minY = vy, maxX = vx + vw, maxY = vy + vh;

  const textRe  = /<text\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?(?:font-size="([^"]+)")?[^>]*>/g;
  const textRe2 = /<text\s[^>]*?\by="([^"]+)"[^>]*?\bx="([^"]+)"[^>]*?(?:font-size="([^"]+)")?[^>]*>/g;
  for (const re of [textRe, textRe2]) {
    let m;
    while ((m = re.exec(svgStr)) !== null) {
      const x = parseFloat(re === textRe ? m[1] : m[2]);
      const y = parseFloat(re === textRe ? m[2] : m[1]);
      const fs = parseFloat(m[3] || '12');
      const pad = fs * 0.6;
      if (x - pad < minX) minX = x - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y - pad < minY) minY = y - pad;
      if (y + pad > maxY) maxY = y + pad;
    }
  }

  const foRe = /<foreignObject\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?\bwidth="([^"]+)"[^>]*?\bheight="([^"]+)"[^>]*>/g;
  let fm;
  while ((fm = foRe.exec(svgStr)) !== null) {
    const fx = parseFloat(fm[1]), fy = parseFloat(fm[2]);
    const fw = parseFloat(fm[3]), fh = parseFloat(fm[4]);
    if (fx < minX) minX = fx;
    if (fy < minY) minY = fy;
    if (fx + fw > maxX) maxX = fx + fw;
    if (fy + fh > maxY) maxY = fy + fh;
  }

  const newVx = Math.min(vx, minX);
  const newVy = Math.min(vy, minY);
  const newVw = Math.max(vx + vw, maxX) - newVx;
  const newVh = Math.max(vy + vh, maxY) - newVy;

  if (newVx === vx && newVy === vy && newVw === vw && newVh === vh) return svgStr;

  const fmt = n => +n.toFixed(4);
  let result = svgStr.replace(vbMatch[0], `viewBox="${fmt(newVx)} ${fmt(newVy)} ${fmt(newVw)} ${fmt(newVh)}"`);

  const wMatch = result.match(/\bwidth="([^"]+)"/);
  const hMatch = result.match(/\bheight="([^"]+)"/);
  if (wMatch && hMatch) {
    const oldW = parseFloat(wMatch[1]), oldH = parseFloat(hMatch[1]);
    const newW = oldW * (newVw / vw);
    const newH = oldH * (newVh / vh);
    result = result.replace(wMatch[0], `width="${fmt(newW)}"`);
    result = result.replace(hMatch[0], `height="${fmt(newH)}"`);
  }
  return result;
}

function embedFontsInSVG(svgStr, fontCSS) {
  if (svgStr.includes('<style>')) {
    return svgStr.replace('<style>', '<style>' + fontCSS);
  }
  return svgStr.replace(/(^<svg[^>]*>)/, '$1<style>' + fontCSS + '</style>');
}

function rgbToRgba(buf, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i*4]     = buf[i*3];
    rgba[i*4+1] = buf[i*3+1];
    rgba[i*4+2] = buf[i*3+2];
    rgba[i*4+3] = 255;
  }
  return rgba;
}

// ── HTML generation helpers (copied from ssim-pipeline.js) ───────────────
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function ssimColor(v) {
  if (v < 0) return '#999';
  if (v >= 0.95) return '#2d8a4e';
  if (v >= 0.85) return '#6a9f2a';
  if (v >= 0.70) return '#c0820a';
  return '#c0392b';
}

function ssimLabel(v) {
  if (v < 0) return 'Negative';
  if (v >= 0.95) return 'Good';
  if (v >= 0.85) return 'Fair';
  if (v >= 0.70) return 'Poor';
  return 'Bad';
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {

  // ── Step 1: Render HiTeXeR SVGs from comparison/asy_src/ ─────────────
  if (STEPS.has('render-htx')) {
    console.log('Rendering HiTeXeR SVGs from comparison/asy_src/...');

    global.window = global.window || {};
    global.katex = require('katex');
    require('./asy-interp.js');
    const A = window.AsyInterp;

    const srcFiles = fs.readdirSync(ASY_SRC).filter(f => f.endsWith('.asy')).sort();
    console.log(`  ${srcFiles.length} .asy files found in asy_src/`);

    let ok = 0, skip = 0, fail = 0, cached = 0;

    for (let i = 0; i < srcFiles.length; i++) {
      const f = srcFiles[i];
      const id = f.replace('.asy', '');
      const svgPath = path.join(SVG_DIR, id + '.svg');

      // Skip if SVG already exists (allows incremental re-runs)
      if (fs.existsSync(svgPath)) { cached++; continue; }

      const raw = fs.readFileSync(path.join(ASY_SRC, f), 'utf8');
      const code = '[asy]\n' + raw + '\n[/asy]';

      if (!A.canInterpret(code)) { skip++; continue; }

      try {
        const r = A.render(code, { containerW: 800, containerH: 600 });
        fs.writeFileSync(svgPath, r.svg);
        ok++;
      } catch (e) { fail++; }

      if ((i + 1) % 500 === 0)
        console.log(`  ${i+1}/${srcFiles.length}  ok=${ok} skip=${skip} fail=${fail} cached=${cached}`);
    }
    console.log(`  Done: ok=${ok} skip=${skip} fail=${fail} cached=${cached}\n`);
  }

  // ── Step 2: Rasterize SVGs → htx_pngs/ ──────────────────────────────
  if (STEPS.has('rasterize')) {
    console.log(`Rasterizing HiTeXeR SVGs to PNGs at ${RASTER_DPI} DPI...`);
    const fontCSS = buildFontFaceCSS();
    console.log(`  Font CSS: ${fontCSS.length} chars`);

    const svgFiles = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg')).sort();
    let ok = 0, fail = 0;

    for (const sf of svgFiles) {
      const id = sf.replace('.svg', '');
      const outPng = path.join(HTX_DIR, id + '.png');

      if (fs.existsSync(outPng)) {
        const svgMtime = fs.statSync(path.join(SVG_DIR, sf)).mtimeMs;
        const pngMtime = fs.statSync(outPng).mtimeMs;
        if (pngMtime >= svgMtime) { ok++; continue; }
      }

      try {
        let svgStr = fs.readFileSync(path.join(SVG_DIR, sf), 'utf8');
        const iw = svgStr.match(/data-intrinsic-w="([^"]+)"/);
        const ih = svgStr.match(/data-intrinsic-h="([^"]+)"/);
        if (iw && ih) {
          svgStr = svgStr.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${iw[1]}"`);
          svgStr = svgStr.replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`);
        }
        const svgExpanded   = expandViewBox(svgStr);
        const svgWithFonts  = embedFontsInSVG(svgExpanded, fontCSS);
        await sharp(Buffer.from(svgWithFonts, 'utf8'), { density: RASTER_DPI })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png()
          .toFile(outPng);
        ok++;
      } catch (e) { fail++; }

      if ((ok + fail) % 200 === 0)
        console.log(`  ${ok + fail}/${svgFiles.length}  ok=${ok} fail=${fail}`);
    }
    console.log(`  Done: ok=${ok} fail=${fail}\n`);
  }

  // ── Step 3: Compute SSIM ─────────────────────────────────────────────
  if (STEPS.has('ssim')) {
    console.log('Computing SSIM scores...');

    const asySet = new Set(fs.readdirSync(ASY_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const htxSet = new Set(fs.readdirSync(HTX_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const pairs  = [...asySet].filter(id => htxSet.has(id)).sort();
    console.log(`  ${pairs.length} pairs to compare`);

    const results = [];

    for (let pi = 0; pi < pairs.length; pi++) {
      const id = pairs[pi];
      const idx = parseInt(id, 10) - 1;
      const corpusFile = corpusFileMap[id] || id;

      try {
        const asyMeta = await sharp(path.join(ASY_DIR, id + '.png')).metadata();
        const htxMeta = await sharp(path.join(HTX_DIR, id + '.png')).metadata();

        const aw = asyMeta.width || 1, ah = asyMeta.height || 1;
        const hw = htxMeta.width || 1, hh = htxMeta.height || 1;

        const MIN_DIM = 8;
        if (aw < MIN_DIM || ah < MIN_DIM || hw < MIN_DIM || hh < MIN_DIM) {
          results.push({ id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1,
            error: 'Image too small', wRatio: hw/aw, hRatio: hh/ah,
            asyDims: [aw,ah], htxDims: [hw,hh] });
          continue;
        }

        const wRatio    = hw / aw;
        const hRatio    = hh / ah;
        const sizeScore = Math.exp(-((wRatio-1)**2 + (hRatio-1)**2) / (2*SIGMA*SIGMA));

        const asyScale = Math.min(MAX_DIM/aw, MAX_DIM/ah, 1);
        const targetW  = Math.max(Math.round(aw * asyScale), 11);
        const targetH  = Math.max(Math.round(ah * asyScale), 11);

        const asyBuf = await sharp(path.join(ASY_DIR, id + '.png'))
          .flatten({ background: {r:255,g:255,b:255} })
          .resize(targetW, targetH, { fit: 'fill' })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        const htxBuf = await sharp(path.join(HTX_DIR, id + '.png'))
          .flatten({ background: {r:255,g:255,b:255} })
          .resize(targetW, targetH, { fit: 'fill' })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        const w = asyBuf.info.width, h = asyBuf.info.height;
        const { mssim } = computeSSIM(
          { data: rgbToRgba(asyBuf.data, w, h), width: w, height: h },
          { data: rgbToRgba(htxBuf.data, w, h), width: w, height: h }
        );
        const combined = mssim * sizeScore;
        results.push({ id, idx, corpusFile, ssim: mssim, sizeScore, combined,
          wRatio, hRatio, asyDims: [aw,ah], htxDims: [hw,hh] });
      } catch (e) {
        results.push({ id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1, error: e.message });
      }

      if ((pi + 1) % 100 === 0) console.log(`  ${pi+1}/${pairs.length}`);
    }

    results.sort((a, b) => a.combined - b.combined);
    fs.writeFileSync(SSIM_FILE, JSON.stringify(results, null, 2));
    console.log(`  Saved ${results.length} results to comparison/ssim-results.json`);
    console.log('  Worst 10:');
    for (const r of results.slice(0, 10))
      console.log(`    #${r.id} (${r.corpusFile}) combined=${r.combined.toFixed(4)} ssim=${r.ssim.toFixed(4)} size=${r.sizeScore.toFixed(4)}${r.error ? ' '+r.error : ''}`);
    console.log();
  }

  // ── Step 4: Generate HTML + blink manifest ───────────────────────────
  if (STEPS.has('html')) {
    console.log('Generating comparison HTML...');

    if (!fs.existsSync(SSIM_FILE)) {
      console.error('  ssim-results.json not found. Run ssim step first.');
      process.exit(1);
    }

    const results    = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf8'));
    const totalPages = Math.ceil(results.length / PER_PAGE);

    const sc = r => r.combined != null ? r.combined : r.ssim;
    const statsGood = results.filter(r => sc(r) >= 0.95).length;
    const statsFair = results.filter(r => sc(r) >= 0.85 && sc(r) < 0.95).length;
    const statsPoor = results.filter(r => sc(r) >= 0 && sc(r) < 0.85).length;
    const statsErr  = results.filter(r => sc(r) < 0).length;

    const TEXER_DIR = path.join(OUT_DIR, 'texer_pngs');

    for (let page = 0; page < totalPages; page++) {
      const start     = page * PER_PAGE;
      const pageItems = results.slice(start, start + PER_PAGE);
      const pageNum   = page + 1;

      let cardsHtml = '';
      for (let ci = 0; ci < pageItems.length; ci++) {
        const r    = pageItems[ci];
        const rank = start + ci + 1;
        const id   = r.id;

        const srcPath   = path.join(ASY_SRC, id + '.asy');
        const code      = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf8') : '';
        const encodedCode = encodeURIComponent('[asy]\n' + code + '\n[/asy]');
        const openUrl   = `../index.html#code=${encodedCode}`;

        const hasAsy    = fs.existsSync(path.join(ASY_DIR, id + '.png'));
        const hasSvg    = fs.existsSync(path.join(SVG_DIR, id + '.svg'));
        const hasTexer  = fs.existsSync(path.join(TEXER_DIR, id + '.png'));
        const showTexer = rank <= 100;

        const gridCols = showTexer ? '25% 25% 25% 25%' : '35% 35% 30%';

        let texerCol = '';
        if (showTexer) {
          texerCol = `
    <div class="render-col">
      <h3>AoPS TeXeR</h3>
      <div class="img-wrap">${hasTexer ? `<img src="texer_pngs/${id}.png">` : '<em class="na">Not rendered</em>'}</div>
    </div>`;
        }

        cardsHtml += `
<div class="card" id="pair-${rank}">
  <div class="card-header">
    <h2>#${rank} &mdash; ${esc(r.corpusFile)}</h2>
    <span class="badge" style="background:${ssimColor(sc(r))}">${sc(r) >= 0 ? sc(r).toFixed(4) : 'N/A'} &middot; ${ssimLabel(sc(r))}</span>
    <span class="badge" style="background:${ssimColor(r.ssim)};margin-left:4px">Content ${r.ssim >= 0 ? r.ssim.toFixed(4) : 'N/A'}</span>
    <span class="badge" style="background:${ssimColor(r.sizeScore != null ? r.sizeScore : -1)};margin-left:4px">Size ${(r.sizeScore != null && r.sizeScore >= 0) ? r.sizeScore.toFixed(4) : 'N/A'}</span>
  </div>
  <div class="card-body" style="grid-template-columns:${gridCols}">
    <div class="render-col">
      <h3>Asymptote (Reference)</h3>
      <div class="img-wrap">${hasAsy ? `<img src="asy_pngs/${id}.png">` : '<em class="na">Not rendered</em>'}</div>
    </div>
    <div class="render-col">
      <h3>HiTeXeR</h3>
      <div class="img-wrap">${hasSvg ? `<div class="htx-svg" data-svg="htx_svgs/${id}.svg"></div>` : '<em class="na">Not rendered</em>'}</div>
    </div>${texerCol}
    <div class="render-col col-source">
      <h3>Source</h3>
      <div class="code-box"><code>${esc(code)}</code></div>
      <div class="link-row">
        <a class="btn" href="${openUrl}" target="_blank">Open in HiTeXeR</a>
        <button class="btn texer-btn" data-code="${esc('[asy]\n'+code+'\n[/asy]')}">Copy &amp; TeXeR</button>
      </div>
      <textarea class="feedback-box" data-rank="${rank}" data-id="${id}" data-file="${esc(r.corpusFile)}" placeholder="Notes about this pair..."></textarea>
    </div>
  </div>
</div>`;
      }

      let pag = '<div class="pag">';
      if (page > 0) pag += `<a href="${page === 1 ? 'index.html' : 'page-'+page+'.html'}">&laquo; Prev</a>`;
      const maxShow = 15;
      let pStart = Math.max(0, page - 7);
      let pEnd   = Math.min(totalPages, pStart + maxShow);
      if (pEnd - pStart < maxShow) pStart = Math.max(0, pEnd - maxShow);
      if (pStart > 0) pag += `<a href="index.html">1</a><span class="dots">…</span>`;
      for (let p = pStart; p < pEnd; p++) {
        const href = p === 0 ? 'index.html' : `page-${p+1}.html`;
        pag += p === page ? `<span class="cur">${p+1}</span>` : `<a href="${href}">${p+1}</a>`;
      }
      if (pEnd < totalPages) pag += `<span class="dots">…</span><a href="page-${totalPages}.html">${totalPages}</a>`;
      if (page < totalPages - 1) pag += `<a href="page-${page+2}.html">Next &raquo;</a>`;
      pag += '</div>';

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HiTeXeR vs Asymptote — Page ${pageNum}/${totalPages}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f2f5;padding:20px;color:#333}
.container{max-width:1600px;margin:0 auto}
h1{text-align:center;font-size:1.7em;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.sub{text-align:center;color:#666;font-size:.92em;margin-bottom:6px}
.stats{text-align:center;margin-bottom:20px;font-size:.88em}
.stats b{display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;margin:0 3px;font-weight:600;font-size:.82em}
.card{background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:24px;overflow:visible}
.card-header{background:#1a1a2e;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0}
.card-header h2{font-size:1em;font-weight:600}
.badge{padding:3px 12px;border-radius:12px;font-size:.75em;font-weight:700;color:#fff;white-space:nowrap}
.card-body{display:grid;gap:0}
.render-col{padding:14px;border-right:1px solid #eee}
.render-col:last-child{border-right:none}
.render-col h3{font-size:.72em;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;text-align:center}
.img-wrap{background:#fff;border:1px solid #ddd;border-radius:6px;min-height:80px;display:flex;align-items:center;justify-content:center;padding:8px;overflow:visible}
.img-wrap img{max-width:100%;height:auto;display:block}.htx-svg{width:100%}.htx-svg svg{display:block;max-width:100%;height:auto}
.na{color:#999;font-size:.85em}
.code-box{background:#f5f5f5;color:#333;font-family:Consolas,monospace;font-size:10.5px;line-height:1.35;padding:8px;border-radius:6px;border:1px solid #ddd;max-height:260px;overflow-y:auto;white-space:pre;word-wrap:normal}
.link-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.btn{display:inline-block;padding:4px 10px;font-size:.78em;font-weight:600;color:#1a1a2e;background:#e8e8f0;border:1px solid #c0c0d0;border-radius:4px;text-decoration:none;cursor:pointer;font-family:inherit}
.btn:hover{background:#1a1a2e;color:#fff}
.pag{text-align:center;margin:24px 0}
.pag a,.pag span{display:inline-block;padding:5px 10px;margin:1px;border-radius:4px;font-size:.85em;text-decoration:none}
.pag a{background:#e8e8f0;color:#1a1a2e}
.pag a:hover{background:#1a1a2e;color:#fff}
.pag .cur{background:#1a1a2e;color:#fff;font-weight:700}
.pag .dots{color:#999}
.feedback-box{width:100%;min-height:36px;margin-top:8px;padding:6px 8px;font-size:.82em;font-family:inherit;border:1px solid #ccc;border-radius:4px;resize:vertical;background:#fafafa}
.feedback-box:focus{border-color:#1a1a2e;outline:none;background:#fff}
.submit-bar{text-align:center;margin:30px 0;padding:20px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.07)}
.submit-bar button{padding:10px 30px;font-size:1em;font-weight:700;color:#fff;background:#1a1a2e;border:none;border-radius:6px;cursor:pointer}
.submit-bar button:hover{background:#2a2a4e}
.submit-bar textarea{width:90%;min-height:200px;margin-top:12px;padding:12px;font-family:Consolas,monospace;font-size:.85em;border:1px solid #ccc;border-radius:6px;display:none}
</style></head><body>
<div class="container">
<h1>HiTeXeR vs Asymptote</h1>
<p class="sub">${results.length} diagrams sorted by combined score (worst first) — Page ${pageNum} of ${totalPages}</p>
<div class="stats">
<b style="background:#2d8a4e">${statsGood} Good</b>
<b style="background:#c0820a">${statsFair} Fair</b>
<b style="background:#c0392b">${statsPoor} Poor</b>
${statsErr > 0 ? `<b style="background:#999">${statsErr} Err</b>` : ''}
</div>
${pag}
${cardsHtml}
${pag}
<div class="submit-bar">
  <button id="collect-btn">Collect Feedback for Claude</button>
  <textarea id="prompt-output" readonly></textarea>
  <button id="copy-prompt" style="display:none;margin-top:8px;padding:6px 16px;font-size:.9em">Copy Prompt to Clipboard</button>
</div>
</div>
<script>
document.querySelectorAll('.texer-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    navigator.clipboard.writeText(btn.getAttribute('data-code')).then(()=>{
      const o=btn.textContent;btn.textContent='Copied!';
      setTimeout(()=>{btn.textContent=o},1500);
      window.open('https://artofproblemsolving.com/texer/','_blank');
    });
  });
});
document.getElementById('collect-btn').addEventListener('click',()=>{
  const boxes=document.querySelectorAll('.feedback-box');
  const items=[];
  boxes.forEach(b=>{
    const msg=b.value.trim();
    if(msg) items.push({rank:b.dataset.rank,id:b.dataset.id,file:b.dataset.file,message:msg});
  });
  if(items.length===0){alert('No feedback entered.');return;}
  let prompt='You are working on the HiTeXeR Asymptote interpreter (asy-interp.js). '+
    'The comparison website shows Asymptote reference PNGs vs HiTeXeR SVG renders side by side, '+
    'ranked by SSIM score (worst first). Here is feedback on specific diagram pairs that need fixing.\\n\\n'+
    'For each item below, the rank # is the SSIM rank, the file is the corpus filename, '+
    'and the ID is the 5-digit numeric ID used for asy_src/{id}.asy.\\n\\n';
  for(const it of items){
    prompt+='--- #'+it.rank+' ('+it.file+', id='+it.id+') ---\\n'+it.message+'\\n\\n';
  }
  prompt+='Please fix these issues in asy-interp.js, then re-run: node recompute-htx.js render-htx rasterize ssim html';
  const out=document.getElementById('prompt-output');
  out.style.display='block';
  out.value=prompt;
  const copyBtn=document.getElementById('copy-prompt');
  copyBtn.style.display='inline-block';
  copyBtn.onclick=()=>{
    navigator.clipboard.writeText(prompt).then(()=>{
      copyBtn.textContent='Copied!';
      setTimeout(()=>{copyBtn.textContent='Copy Prompt to Clipboard'},1500);
    });
  };
});
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'&&e.shiftKey){
    const next=[...document.querySelectorAll('.pag a')].find(a=>a.textContent.includes('Next'));
    if(next)location.href=next.href;
  }
});
document.querySelectorAll('.htx-svg[data-svg]').forEach(el=>{
  fetch(el.dataset.svg).then(r=>r.text()).then(svg=>{
    el.innerHTML=svg;
  }).catch(()=>{el.innerHTML='<em class="na">SVG load failed</em>';});
});
</script></body></html>`;

      const fname = page === 0 ? 'index.html' : `page-${pageNum}.html`;
      for (let _retry = 0; _retry < 5; _retry++) {
        try { fs.writeFileSync(path.join(OUT_DIR, fname), html); break; }
        catch(e) {
          if (_retry === 4) console.warn(`  Warning: failed to write ${fname}: ${e.code}`);
          else { const t = Date.now(); while(Date.now()-t < 200*(_retry+1)); }
        }
      }
    }

    if (totalPages > 0 && fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
      fs.copyFileSync(path.join(OUT_DIR, 'index.html'), path.join(OUT_DIR, 'page-1.html'));
    }
    console.log(`  Wrote ${totalPages} pages\n`);

    // Regenerate blink-manifest.json
    const manifestScript = path.join(OUT_DIR, 'generate-manifest.js');
    if (fs.existsSync(manifestScript)) {
      console.log('Regenerating blink-manifest.json...');
      require('child_process').execSync(`node "${manifestScript}"`, { stdio: 'inherit', cwd: ROOT });
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
