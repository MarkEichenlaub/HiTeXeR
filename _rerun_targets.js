// Rerun HiTeXeR render + SSIM for just the 21 target diagrams.
// Mirrors the logic in ssim-pipeline.js (render-htx, rasterize, ssim).
'use strict';
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT        = __dirname;
const CORPUS_DIR  = path.join(ROOT, 'asy_corpus');
const OUT_DIR     = path.join(ROOT, 'comparison');
const ASY_SRC_DIR = path.join(OUT_DIR, 'asy_src');
const SVG_DIR     = path.join(OUT_DIR, 'htx_svgs');
const HTX_DIR     = path.join(OUT_DIR, 'htx_pngs');
const TEXER_DIR   = path.join(OUT_DIR, 'texer_pngs');
const RASTER_DPI  = 144;
const KATEX_FONTS_DIR = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');

const TARGETS = ['12826','12942','12837','08812','10427','05896','05904',
                 '10394','10432','04484','12796','10431','12941','12750',
                 '12736','04618','03582','12903','05416','04638','02409'];

const baseline = JSON.parse(fs.readFileSync(path.join(ROOT,'_baseline_ssim.json'),'utf8'));

// ── Font face CSS (matches ssim-pipeline.js) ────────────────────
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
  if (svgStr.includes('<style>')) return svgStr.replace('<style>','<style>'+css);
  return svgStr.replace(/(^<svg[^>]*>)/, '$1<style>'+css+'</style>');
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
    if (fx<minX)minX=fx; if (fy<minY)minY=fy;
    if (fx+fw>maxX)maxX=fx+fw; if (fy+fh>maxY)maxY=fy+fh;
  }
  const nx=Math.min(vx,minX), ny=Math.min(vy,minY);
  const nw=Math.max(vx+vw,maxX)-nx, nh=Math.max(vy+vh,maxY)-ny;
  if (nx===vx && ny===vy && nw===vw && nh===vh) return svgStr;
  const fmt=n=>+n.toFixed(4);
  let r=svgStr.replace(vb[0], `viewBox="${fmt(nx)} ${fmt(ny)} ${fmt(nw)} ${fmt(nh)}"`);
  const wM=r.match(/\bwidth="([^"]+)"/), hM=r.match(/\bheight="([^"]+)"/);
  if (wM&&hM) {
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

async function main() {
  // Load the (possibly edited) HiTeXeR interpreter
  global.window = global.window || {};
  global.katex = require('katex');
  require('./asy-interp.js');
  const A = window.AsyInterp;

  const fontCSS = buildFontFaceCSS();
  const rows = [];

  for (const id of TARGETS) {
    const asyPath = path.join(ASY_SRC_DIR, id + '.asy');
    if (!fs.existsSync(asyPath)) { rows.push({id, err:'no asy_src'}); continue; }
    const raw = fs.readFileSync(asyPath, 'utf8');
    const code = '[asy]\n' + raw + '\n[/asy]';

    // Render with HiTeXeR
    let svg;
    try {
      const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
      svg = r.svg;
      fs.writeFileSync(path.join(SVG_DIR, id + '.svg'), svg);
    } catch (e) {
      rows.push({id, err:'htx-render: '+e.message.substring(0,80)}); continue;
    }

    // Rasterize to PNG at 144 DPI with fonts embedded (matches pipeline)
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
      rows.push({id, err:'rasterize: '+e.message.substring(0,80)}); continue;
    }

    // SSIM vs TeXer reference
    const refPng = path.join(TEXER_DIR, id + '.png');
    if (!fs.existsSync(refPng)) { rows.push({id, err:'no texer ref'}); continue; }

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
      const targetW = Math.max(Math.round(maxW*scale),11);
      const targetH = Math.max(Math.round(maxH*scale),11);

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

      const b = baseline[id]?.ssim ?? null;
      rows.push({id, ssim:mssim, sizeScore, combined, baseline:b});
    } catch (e) {
      rows.push({id, err:'ssim: '+e.message.substring(0,80)});
    }
  }

  // Report
  console.log('\nID     Baseline  New SSIM  SizeScr   Combined  Delta(SSIM)');
  let improved=0, worse=0, same=0, err=0;
  for (const r of rows) {
    if (r.err) { console.log(`${r.id}  ERROR: ${r.err}`); err++; continue; }
    const b = r.baseline;
    const delta = (b!=null) ? r.ssim - b : null;
    const arrow = delta==null?'':(delta>1e-4?'▲':delta<-1e-4?'▼':'·');
    const ds = delta==null?'  N/A ':((delta>=0?'+':'')+delta.toFixed(4));
    console.log(`${r.id}  ${b!=null?b.toFixed(4):'  N/A '}    ${r.ssim.toFixed(4)}    ${r.sizeScore.toFixed(4)}    ${r.combined.toFixed(4)}    ${ds} ${arrow}`);
    if (delta==null) {}
    else if (delta>1e-4) improved++;
    else if (delta<-1e-4) worse++;
    else same++;
  }
  console.log(`\nImproved: ${improved}   Worse: ${worse}   Unchanged: ${same}   Errors: ${err}`);
}

main().catch(e => { console.error(e); process.exit(1); });
