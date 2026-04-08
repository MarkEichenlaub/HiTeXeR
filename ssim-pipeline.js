'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const sharp = require('sharp');

// ── Config ──────────────────────────────────────────────────────
const ROOT        = __dirname;
const CORPUS_DIR  = path.join(ROOT, 'asy_corpus');
const OUT_DIR     = path.join(ROOT, 'comparison');
const ASY_DIR     = path.join(OUT_DIR, 'asy_pngs');
const HTX_DIR     = path.join(OUT_DIR, 'htx_pngs');
const SVG_DIR     = path.join(OUT_DIR, 'htx_svgs');
const ASY_SRC_DIR = path.join(OUT_DIR, 'asy_src');
const ASY_EXE     = 'C:\\Program Files\\Asymptote\\asy.exe';
// dvips (used by Asymptote for EPS with labels) cannot handle spaces in paths.
// Use a short temp directory without spaces for EPS rendering.
const ASY_TMP     = 'C:\\asy_tmp';
const PER_PAGE    = 100;
const TEXER_DIR   = path.join(OUT_DIR, 'texer_pngs');
// HiTeXeR SVGs use 120/72 CSS-px per big-point (see bpToCSSPx in asy-interp.js).
// Asymptote EPS is rasterized at 240 DPI (=240/72 px per bp).
// To make both produce the same pixel dimensions for the same drawing:
//   htx_px = css_w * D/96 = (bp * 120/72) * D/96
//   asy_px = bp * 240/72
//   Matching: D = 240 * 96 / 120 = 192
const RASTER_DPI  = 192;

const args = process.argv.slice(2);
const STEPS = new Set(args.length ? args : ['render-htx','render-asy','rasterize','ssim','html']);

for (const d of [OUT_DIR, ASY_DIR, HTX_DIR, SVG_DIR, ASY_SRC_DIR, ASY_TMP, TEXER_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const allFiles = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy')).sort();
console.log(`Corpus: ${allFiles.length} .asy files\n`);

function numId(i) { return String(i + 1).padStart(5, '0'); }

// Run an executable with args and a timeout.
// On Windows, child processes (latex, dvips) survive when the parent asy.exe is killed.
// We use spawn() + manual timeout + taskkill /F /PID /T to kill the entire tree.
function runCmd(exe, args, opts = {}) {
  const timeout = opts.timeout || 30000;
  const cwd = opts.cwd;
  const { spawn: cpSpawn } = require('child_process');

  return new Promise((resolve, reject) => {
    const child = cpSpawn(exe, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      // Kill entire process tree by PID
      try { execSync(`taskkill /F /PID ${child.pid} /T 2>nul`, { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch(e) {}
      reject(new Error('Timeout after ' + timeout + 'ms'));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.substring(0, 500) || 'Exit code ' + code));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// ── KaTeX font embedding for SVG rasterization ─────────────────
// sharp/librsvg cannot load web fonts by URL. We embed the actual font data
// as base64 @font-face declarations so SVG text renders with correct glyphs.
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
    const fontPath = path.join(KATEX_FONTS_DIR, f.file);
    if (!fs.existsSync(fontPath)) continue;
    const b64 = fs.readFileSync(fontPath).toString('base64');
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  return css;
}

function embedFontsInSVG(svgStr, fontCSS) {
  // Inject font-face CSS into the existing <style> block, or add one
  if (svgStr.includes('<style>')) {
    return svgStr.replace('<style>', '<style>' + fontCSS);
  }
  // Insert a <style> right after the opening <svg ...> tag
  return svgStr.replace(/(^<svg[^>]*>)/, '$1<style>' + fontCSS + '</style>');
}

// ── Main ────────────────────────────────────────────────────────
async function main() {

  // ── Step 1: Save .asy sources + render with HiTeXeR ───────────
  if (STEPS.has('render-htx')) {
    console.log('Saving .asy source files...');
    for (let i = 0; i < allFiles.length; i++) {
      const src = fs.readFileSync(path.join(CORPUS_DIR, allFiles[i]), 'utf8');
      fs.writeFileSync(path.join(ASY_SRC_DIR, numId(i) + '.asy'), src);
    }
    console.log(`  Saved ${allFiles.length} .asy files`);

    console.log('Rendering with HiTeXeR JS interpreter...');
    global.window = global.window || {};
    global.katex = require('katex');
    require('./asy-interp.js');
    const A = window.AsyInterp;

    let ok = 0, skip = 0, fail = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i];
      const id = numId(i);
      const raw = fs.readFileSync(path.join(CORPUS_DIR, f), 'utf8');
      const code = '[asy]\n' + raw + '\n[/asy]';

      if (!A.canInterpret(code)) { skip++; continue; }

      try {
        const r = A.render(code, { containerW: 500, containerH: 400 });
        fs.writeFileSync(path.join(SVG_DIR, id + '.svg'), r.svg);
        ok++;
      } catch (e) { fail++; }

      if ((i + 1) % 500 === 0)
        console.log(`  ${i + 1}/${allFiles.length}  ok=${ok} skip=${skip} fail=${fail}`);
    }
    console.log(`  Done: ok=${ok} skip=${skip} fail=${fail}\n`);
  }

  // ── Step 2: Render with real Asymptote ────────────────────────
  if (STEPS.has('render-asy')) {
    console.log('Rendering with real Asymptote...');

    // Auto-import detection — matches TeXeR (AoPS server) behavior.
    // Ported from dynalist_aops_sync/local_asymptote_preview.py
    const TEXER_AUTO_IMPORTS = {
      graph: [
        /\bgraph\s*\(/,        // graph() function
        /\bxaxis\s*\(/,        // xaxis()
        /\byaxis\s*\(/,        // yaxis()
        /\bRightTicks\b/,      // RightTicks
        /\bLeftTicks\b/,       // LeftTicks
        /\bTicks\b/,           // Ticks
        /\bBottomTop\b/,       // BottomTop
        /\bLeftRight\b/,       // LeftRight
        /\bCircle\s*\(/,       // Circle() (capital C, defined in graph.asy)
        /\bArc\s*\(/,          // Arc() (capital A, defined in graph.asy)
      ],
      olympiad: [
        /\bmarkscalefactor\b/, // markscalefactor variable
        /\banglemark\s*\(/,    // anglemark()
        /\brightanglemark\s*\(/, // rightanglemark()
        /\bcircumcenter\s*\(/, // circumcenter()
        /\bcircumcircle\s*\(/, // circumcircle()
        /\bcircumradius\s*\(/, // circumradius()
        /\bincenter\s*\(/,     // incenter()
        /\binradius\s*\(/,     // inradius()
        /\bfoot\s*\(/,         // foot()
      ],
      geometry: [
        /\borigin\b/,          // origin = point(defaultcoordsys, (0,0))
        /\btriangle\s+/,       // triangle type
      ],
      math: [
        /\bgrid\s*\(/,         // grid(int, int, pen) in math.asy
      ],
      cse5: [
        /\bLine\s*\(/,         // Line() (capital L, cse5 alias)
        /\bCR\s*\(/,           // CR() (circle/arc by radius)
        /\bCP\s*\(/,           // CP() (circle by point)
        /\bnullpair\b/,        // nullpair sentinel value
        /\bMP\s*\(/,           // MP() (mark point with label)
        /\bD\s*\(/,            // D() (draw shorthand)
        /\bpathpen\b/,         // pathpen default pen
        /\bpointpen\b/,        // pointpen default pen
      ],
      three: [
        /\btriple\b/,          // triple type
        /\bX\s*--\s*Y\b/,     // 3D axis references
        /\bdraw\s*\(.*path3/,  // path3 usage
      ],
      markers: [
        /\bpathticks\s*\(/,    // pathticks()
        /\bmarkangle\s*\(/,    // markangle()
        /\bstickmarkspacefactor\b/, // stickmarkspacefactor
        /\bHookHead\b/,        // HookHead arrowhead style
        /\bArcArrows?\b/,      // ArcArrow(s) arrow style
        /\bstickmarksizefactor\b/, // stickmarksizefactor
      ],
    };

    function prepareAsySource(raw) {
      let src = raw.trimEnd();

      // Fix truncated files missing final semicolon
      if (src.length > 0 && !/[;{}]$/.test(src)) {
        src += ';';
      }

      let preambleLines = [];

      // Auto-detect needed imports
      for (const [mod, patterns] of Object.entries(TEXER_AUTO_IMPORTS)) {
        const importRe = new RegExp('^\\s*import\\s+' + mod + '\\s*;', 'm');
        if (importRe.test(src)) {
          // Even if import is already present, add 3D settings if needed
          if (mod === 'three' && !/settings\.render\s*=/.test(src)) {
            preambleLines.push('settings.render=0;');
            preambleLines.push('settings.prc=false;');
          }
          continue;
        }
        for (const pat of patterns) {
          if (pat.test(src)) {
            preambleLines.push('import ' + mod + ';');
            if (mod === 'three') {
              preambleLines.push('settings.render=0;');
              preambleLines.push('settings.prc=false;');
            }
            break;
          }
        }
      }

      // xcolor for \definecolor
      if (/\\definecolor\b/.test(src) && !/texpreamble.*xcolor/.test(src)) {
        preambleLines.push('texpreamble("\\usepackage{xcolor}");');
      }

      if (preambleLines.length > 0) {
        src = preambleLines.join('\n') + '\n\n' + src;
      }

      // Default size when none specified — matches HiTeXeR auto-scale behavior.
      // Without this, Asymptote PNG output is only a few pixels.
      if (!/\bsize\s*\(/.test(src)) {
        src = 'size(200);\n' + src;
      }

      // Ensure white background and proper label rendering.
      // shipout(bbox(white)) ensures labels are included in the bounding box
      // and the output has a white background (matching TeXeR behavior).
      // Use 0 padding to match HiTeXeR output sizing.
      if (!/\bshipout\b/.test(src)) {
        src += '\nshipout(bbox(0, white));';
      }

      return src;
    }

    const htxFiles = new Set(fs.readdirSync(SVG_DIR).map(f => f.replace('.svg', '')));
    const toRender = allFiles.map((f, i) => ({ file: f, id: numId(i), idx: i }))
      .filter(x => htxFiles.has(x.id));

    console.log(`  ${toRender.length} files to render with Asymptote`);
    let ok = 0, fail = 0, skipped = 0;

    // Track failures to avoid re-trying on subsequent runs
    const failFile = path.join(OUT_DIR, 'asy_failures.json');
    let failures = new Set();
    if (fs.existsSync(failFile)) {
      try { failures = new Set(JSON.parse(fs.readFileSync(failFile, 'utf8'))); } catch(e) {}
    }

    // Copy TrigMacros.asy to temp dir so Asymptote can find it
    const trigSrc = path.join(ASY_DIR, 'TrigMacros.asy');
    if (fs.existsSync(trigSrc)) {
      fs.copyFileSync(trigSrc, path.join(ASY_TMP, 'TrigMacros.asy'));
    }

    for (const { file, id } of toRender) {
      const outPng = path.join(ASY_DIR, id + '.png');
      if (fs.existsSync(outPng)) { ok++; continue; }
      if (failures.has(id)) { skipped++; continue; }

      const raw = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8');
      const src = prepareAsySource(raw);

      // Use space-free temp dir for EPS rendering (dvips can't handle spaces)
      const tmpFile = path.join(ASY_TMP, id + '.asy');
      fs.writeFileSync(tmpFile, src);
      const tmpBase = path.join(ASY_TMP, id);

      try {
        // Render to EPS first, then convert to PNG at 240 DPI (matching AoPS TeXeR)
        await runCmd(ASY_EXE, ['-noView', '-nobatchView', '-nointeractiveView', '-f', 'eps', '-o', tmpBase, tmpFile], { timeout: 30000, cwd: ASY_TMP });
        // Asymptote may produce id.eps or id_0.eps (multi-page/labels)
        let epsFile = tmpBase + '.eps';
        if (!fs.existsSync(epsFile)) {
          for (const alt of ['_0.eps', '+0.eps']) {
            if (fs.existsSync(tmpBase + alt)) { epsFile = tmpBase + alt; break; }
          }
        }
        await runCmd('magick', ['-density', '240', epsFile, '-flatten', outPng], { timeout: 30000 });
        ok++;
      } catch (e) {
        fail++;
        failures.add(id);
      }

      // Clean up all temp files for this id
      {
        const auxExts = ['.asy', '.eps', '_0.eps', '+0.eps', '_1.eps', '+1.eps',
          '_.tex', '_.aux', '_.log', '_.pre', '_.dvi',
          '.pre', '.tex', '.aux', '.log', '.dvi',
          '.pdf', '_.pdf'];
        for (const ext of auxExts) {
          try { fs.unlinkSync(tmpBase + ext); } catch(e) {}
        }
        for (const f of ['texput.aux', 'texput.log']) {
          try { fs.unlinkSync(path.join(ASY_TMP, f)); } catch(e) {}
        }
      }

      if ((ok + fail) % 100 === 0) {
        console.log(`  ${ok + fail + skipped}/${toRender.length}  ok=${ok} fail=${fail} skipped=${skipped}`);
        // Save failures periodically
        fs.writeFileSync(failFile, JSON.stringify([...failures]));
      }
    }
    fs.writeFileSync(failFile, JSON.stringify([...failures]));
    console.log(`  Done: ok=${ok} fail=${fail} skipped=${skipped}\n`);
  }

  // ── Step 3: Rasterize SVGs to PNGs ────────────────────────────
  if (STEPS.has('rasterize')) {
    console.log(`Rasterizing HiTeXeR SVGs to PNGs at ${RASTER_DPI} DPI (matching Asymptote)...`);
    const fontCSS = buildFontFaceCSS();
    console.log(`  Font CSS built: ${fontCSS.length} chars (${fontCSS ? 'OK' : 'EMPTY — fonts will fall back'})`);
    const svgFiles = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg')).sort();
    let ok = 0, fail = 0;

    for (const sf of svgFiles) {
      const id = sf.replace('.svg', '');
      const outPng = path.join(HTX_DIR, id + '.png');
      if (fs.existsSync(outPng)) {
        // Skip only if PNG is newer than SVG (i.e. SVG hasn't changed since last rasterize)
        const svgMtime = fs.statSync(path.join(SVG_DIR, sf)).mtimeMs;
        const pngMtime = fs.statSync(outPng).mtimeMs;
        if (pngMtime >= svgMtime) { ok++; continue; }
      }

      try {
        const svgStr = fs.readFileSync(path.join(SVG_DIR, sf), 'utf8');
        const svgWithFonts = embedFontsInSVG(svgStr, fontCSS);
        const svgBuf = Buffer.from(svgWithFonts, 'utf8');
        await sharp(svgBuf, { density: RASTER_DPI }).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toFile(outPng);
        ok++;
      } catch (e) { fail++; }

      if ((ok + fail) % 200 === 0)
        console.log(`  ${ok + fail}/${svgFiles.length}  ok=${ok} fail=${fail}`);
    }
    console.log(`  Done: ok=${ok} fail=${fail}\n`);
  }

  // ── Step 4: Compute SSIM ─────────────────────────────────────
  if (STEPS.has('ssim')) {
    console.log('Computing SSIM scores...');
    const { ssim: computeSSIM } = require('ssim.js');

    const asyPngs = new Set(fs.readdirSync(ASY_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const htxPngs = new Set(fs.readdirSync(HTX_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const pairs = [...asyPngs].filter(id => htxPngs.has(id)).sort();
    console.log(`  ${pairs.length} pairs to compare`);

    const results = [];

    for (let pi = 0; pi < pairs.length; pi++) {
      const id = pairs[pi];
      const idx = parseInt(id, 10) - 1;
      const corpusFile = allFiles[idx] || id;

      try {
        // Get native dimensions of both images
        const asyMeta = await sharp(path.join(ASY_DIR, id + '.png')).metadata();
        const htxMeta = await sharp(path.join(HTX_DIR, id + '.png')).metadata();

        // Skip images that are too small (likely failed renders)
        const MIN_DIM = 8;
        if ((asyMeta.width || 0) < MIN_DIM || (asyMeta.height || 0) < MIN_DIM ||
            (htxMeta.width || 0) < MIN_DIM || (htxMeta.height || 0) < MIN_DIM) {
          results.push({ id, idx, corpusFile, ssim: -1, error: 'Image too small' });
          continue;
        }

        // Use a common target size: scale both to fit in 400px max dimension,
        // then pad to the SAME canvas size so SSIM compares matching pixels.
        const MAX = 400;

        // Scale Asymptote image to fit in MAXxMAX
        const asyScale = Math.min(MAX / (asyMeta.width || 1), MAX / (asyMeta.height || 1), 1);
        const asyW = Math.round((asyMeta.width || 1) * asyScale);
        const asyH = Math.round((asyMeta.height || 1) * asyScale);

        // Scale HiTeXeR image to fit in MAXxMAX
        const htxScale = Math.min(MAX / (htxMeta.width || 1), MAX / (htxMeta.height || 1), 1);
        const htxW = Math.round((htxMeta.width || 1) * htxScale);
        const htxH = Math.round((htxMeta.height || 1) * htxScale);

        // Common canvas: use the max of both scaled dimensions
        const canvasW = Math.max(asyW, htxW, 8);
        const canvasH = Math.max(asyH, htxH, 8);

        const asyBuf = await sharp(path.join(ASY_DIR, id + '.png'))
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .resize(asyW, asyH, { fit: 'fill' })
          .extend({
            top: Math.round((canvasH - asyH) / 2),
            bottom: canvasH - asyH - Math.round((canvasH - asyH) / 2),
            left: Math.round((canvasW - asyW) / 2),
            right: canvasW - asyW - Math.round((canvasW - asyW) / 2),
            background: { r: 255, g: 255, b: 255 }
          })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        const htxBuf = await sharp(path.join(HTX_DIR, id + '.png'))
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .resize(htxW, htxH, { fit: 'fill' })
          .extend({
            top: Math.round((canvasH - htxH) / 2),
            bottom: canvasH - htxH - Math.round((canvasH - htxH) / 2),
            left: Math.round((canvasW - htxW) / 2),
            right: canvasW - htxW - Math.round((canvasW - htxW) / 2),
            background: { r: 255, g: 255, b: 255 }
          })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        const w = asyBuf.info.width, h = asyBuf.info.height;

        function rgbToRgba(buf, width, height) {
          const rgba = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < width * height; i++) {
            rgba[i * 4]     = buf[i * 3];
            rgba[i * 4 + 1] = buf[i * 3 + 1];
            rgba[i * 4 + 2] = buf[i * 3 + 2];
            rgba[i * 4 + 3] = 255;
          }
          return rgba;
        }

        const asyImg = { data: rgbToRgba(asyBuf.data, w, h), width: w, height: h };
        const htxImg = { data: rgbToRgba(htxBuf.data, w, h), width: w, height: h };

        const { mssim } = computeSSIM(asyImg, htxImg);
        results.push({ id, idx, corpusFile, ssim: mssim });
      } catch (e) {
        results.push({ id, idx, corpusFile, ssim: -1, error: e.message });
      }

      if ((pi + 1) % 100 === 0)
        console.log(`  ${pi + 1}/${pairs.length}`);
    }

    results.sort((a, b) => a.ssim - b.ssim);
    fs.writeFileSync(path.join(OUT_DIR, 'ssim-results.json'), JSON.stringify(results, null, 2));

    console.log(`  Saved ${results.length} results to comparison/ssim-results.json`);
    console.log(`  Worst 10:`);
    for (const r of results.slice(0, 10))
      console.log(`    #${r.id} (${r.corpusFile}) SSIM=${r.ssim.toFixed(4)}${r.error ? ' ' + r.error : ''}`);
    console.log();
  }

  // ── Step 5: Generate paginated comparison HTML ────────────────
  if (STEPS.has('html')) {
    console.log('Generating comparison HTML...');
    const resultsPath = path.join(OUT_DIR, 'ssim-results.json');
    if (!fs.existsSync(resultsPath)) {
      console.error('  ssim-results.json not found. Run ssim step first.');
      process.exit(1);
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const totalPages = Math.ceil(results.length / PER_PAGE);

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

    const statsGood = results.filter(r => r.ssim >= 0.95).length;
    const statsFair = results.filter(r => r.ssim >= 0.85 && r.ssim < 0.95).length;
    const statsPoor = results.filter(r => r.ssim >= 0 && r.ssim < 0.85).length;
    const statsErr  = results.filter(r => r.ssim < 0).length;

    for (let page = 0; page < totalPages; page++) {
      const start = page * PER_PAGE;
      const pageItems = results.slice(start, start + PER_PAGE);
      const pageNum = page + 1;

      let cardsHtml = '';
      for (let ci = 0; ci < pageItems.length; ci++) {
        const r = pageItems[ci];
        const rank = start + ci + 1;
        const id = r.id;

        const srcPath = path.join(ASY_SRC_DIR, id + '.asy');
        const code = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf8') : '';
        const encodedCode = encodeURIComponent('[asy]\n' + code + '\n[/asy]');
        const openUrl = `../index.html#code=${encodedCode}`;

        const hasAsy = fs.existsSync(path.join(ASY_DIR, id + '.png'));
        const hasSvg = fs.existsSync(path.join(SVG_DIR, id + '.svg'));
        const hasHtxPng = fs.existsSync(path.join(HTX_DIR, id + '.png'));
        const hasTexer = fs.existsSync(path.join(TEXER_DIR, id + '.png'));
        const showTexer = rank <= 100; // Only show TeXer column for first 100

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
    <span class="badge" style="background:${ssimColor(r.ssim)}">SSIM ${r.ssim.toFixed(4)} &middot; ${ssimLabel(r.ssim)}</span>
  </div>
  <div class="card-body" style="grid-template-columns:${gridCols}">
    <div class="render-col">
      <h3>Asymptote (Reference)</h3>
      <div class="img-wrap">${hasAsy ? `<img src="asy_pngs/${id}.png">` : '<em class="na">Not rendered</em>'}</div>
    </div>
    <div class="render-col">
      <h3>HiTeXeR</h3>
      <div class="img-wrap">${hasSvg ? `<object data="htx_svgs/${id}.svg" type="image/svg+xml">SVG</object>` : '<em class="na">Not rendered</em>'}</div>
    </div>${texerCol}
    <div class="render-col col-source">
      <h3>Source</h3>
      <div class="code-box"><code>${esc(code)}</code></div>
      <div class="link-row">
        <a class="btn" href="${openUrl}" target="_blank">Open in HiTeXeR</a>
        <button class="btn texer-btn" data-code="${esc('[asy]\n' + code + '\n[/asy]')}">Copy &amp; TeXeR</button>
      </div>
      <textarea class="feedback-box" data-rank="${rank}" data-id="${id}" data-file="${esc(r.corpusFile)}" placeholder="Notes about this pair..."></textarea>
    </div>
  </div>
</div>`;
      }

      // Pagination
      let pag = '<div class="pag">';
      if (page > 0) pag += `<a href="${page === 1 ? 'index.html' : 'page-' + page + '.html'}">&laquo; Prev</a>`;
      const maxShow = 15;
      let pStart = Math.max(0, page - 7);
      let pEnd = Math.min(totalPages, pStart + maxShow);
      if (pEnd - pStart < maxShow) pStart = Math.max(0, pEnd - maxShow);
      if (pStart > 0) pag += `<a href="index.html">1</a><span class="dots">…</span>`;
      for (let p = pStart; p < pEnd; p++) {
        const href = p === 0 ? 'index.html' : `page-${p + 1}.html`;
        pag += p === page ? `<span class="cur">${p + 1}</span>` : `<a href="${href}">${p + 1}</a>`;
      }
      if (pEnd < totalPages) pag += `<span class="dots">…</span><a href="page-${totalPages}.html">${totalPages}</a>`;
      if (page < totalPages - 1) pag += `<a href="page-${page + 2}.html">Next &raquo;</a>`;
      pag += '</div>';

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HiTeXeR vs Asymptote — Page ${pageNum}/${totalPages}</title>
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
.card-body{display:grid;grid-template-columns:35% 35% 30%;gap:0}
.render-col{padding:14px;border-right:1px solid #eee}
.render-col:last-child{border-right:none}
.render-col h3{font-size:.72em;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;text-align:center}
.img-wrap{background:#fff;border:1px solid #ddd;border-radius:6px;min-height:80px;display:flex;align-items:center;justify-content:center;padding:8px;overflow:visible}
.img-wrap img{max-width:100%;height:auto;display:block}.img-wrap object{width:100%;display:block}
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
<p class="sub">${results.length} diagrams sorted by SSIM (worst first) — Page ${pageNum} of ${totalPages}</p>
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
    if(msg){
      items.push({rank:b.dataset.rank,id:b.dataset.id,file:b.dataset.file,message:msg});
    }
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
  prompt+='Please fix these issues in asy-interp.js, then re-run the SSIM pipeline: node ssim-pipeline.js render-htx rasterize ssim html';
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
</script></body></html>`;

      const fname = page === 0 ? 'index.html' : `page-${pageNum}.html`;
      fs.writeFileSync(path.join(OUT_DIR, fname), html);
    }

    // page-1.html alias
    if (totalPages > 0 && fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
      fs.copyFileSync(path.join(OUT_DIR, 'index.html'), path.join(OUT_DIR, 'page-1.html'));
    }

    console.log(`  Wrote ${totalPages} pages\n`);
  }

  console.log('Pipeline complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
