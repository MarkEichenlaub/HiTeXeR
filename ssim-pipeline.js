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
// sharp/librsvg treats SVG width/height as points (1/72 inch), not CSS pixels
// (1/96 inch), so the effective scale is D/72 not D/96:
//   htx_px = css_w * D/72 = (bp * 120/72) * D/72
//   asy_px = bp * 240/72
//   Matching: D = 240 * 72 / 120 = 144
const RASTER_DPI  = 144;

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

/**
 * Expand the SVG viewBox so that elements positioned via overflow:visible
 * (e.g. axis tick labels) are included in the rasterized output.
 * Browsers honour overflow:visible, but librsvg/sharp clip to the viewBox.
 */
function expandViewBox(svgStr) {
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/);
  if (!vbMatch) return svgStr;
  let [vx, vy, vw, vh] = vbMatch[1].split(/\s+/).map(Number);
  let minX = vx, minY = vy, maxX = vx + vw, maxY = vy + vh;

  // Scan <text> elements for their y position (+font-size padding).
  // Extract the full opening tag first, then parse x/y/font-size individually
  // to avoid non-greedy quantifier issues that cause font-size to be missed.
  const textTagRe = /<text\s[^>]*>/g;
  {
    let m;
    while ((m = textTagRe.exec(svgStr)) !== null) {
      const tag = m[0];
      const xM = tag.match(/\bx="([^"]+)"/);
      const yM = tag.match(/\by="([^"]+)"/);
      const fsM = tag.match(/\bfont-size="([^"]+)"/);
      if (!xM || !yM) continue;
      const x = parseFloat(xM[1]);
      const y = parseFloat(yM[1]);
      const fs = parseFloat(fsM ? fsM[1] : '12');
      const pad = fs * 0.6; // half the font height as padding
      if (x - pad < minX) minX = x - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y - pad < minY) minY = y - pad;
      if (y + pad > maxY) maxY = y + pad;
    }
  }

  // Scan <foreignObject> elements (KaTeX labels)
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

  // Only expand, never shrink
  const newVx = Math.min(vx, minX);
  const newVy = Math.min(vy, minY);
  const newVw = Math.max(vx + vw, maxX) - newVx;
  const newVh = Math.max(vy + vh, maxY) - newVy;

  if (newVx === vx && newVy === vy && newVw === vw && newVh === vh) return svgStr;

  // Update viewBox
  const fmt = n => +n.toFixed(4);
  let result = svgStr.replace(vbMatch[0], `viewBox="${fmt(newVx)} ${fmt(newVy)} ${fmt(newVw)} ${fmt(newVh)}"`);

  // Scale width/height proportionally so pixel density stays the same
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
        const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
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
        let svgStr = fs.readFileSync(path.join(SVG_DIR, sf), 'utf8');
        // Use intrinsic dimensions (before container scaling) so the rasterized
        // PNG matches Asymptote's output size rather than the 800x600 display container.
        const iw = svgStr.match(/data-intrinsic-w="([^"]+)"/);
        const ih = svgStr.match(/data-intrinsic-h="([^"]+)"/);
        if (iw && ih) {
          svgStr = svgStr.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${iw[1]}"`);
          svgStr = svgStr.replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`);
        }
        const svgExpanded = expandViewBox(svgStr);
        const svgWithFonts = embedFontsInSVG(svgExpanded, fontCSS);
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

    const refPngs = new Set(fs.readdirSync(TEXER_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const htxPngs = new Set(fs.readdirSync(HTX_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
    const pairs = [...refPngs].filter(id => htxPngs.has(id)).sort();
    console.log(`  ${pairs.length} pairs to compare`);

    const results = [];

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

    for (let pi = 0; pi < pairs.length; pi++) {
      const id = pairs[pi];
      const idx = parseInt(id, 10) - 1;
      const corpusFile = allFiles[idx] || id;

      try {
        // Get native dimensions of both images
        const refMeta = await sharp(path.join(TEXER_DIR, id + '.png')).metadata();
        const htxMeta = await sharp(path.join(HTX_DIR, id + '.png')).metadata();

        const aw = refMeta.width || 1, ah = refMeta.height || 1;
        const hw = htxMeta.width || 1, hh = htxMeta.height || 1;

        // Skip images that are too small (likely failed renders)
        const MIN_DIM = 8;
        if (aw < MIN_DIM || ah < MIN_DIM || hw < MIN_DIM || hh < MIN_DIM) {
          results.push({ id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1, error: 'Image too small',
            wRatio: hw / aw, hRatio: hh / ah, refDims: [aw, ah], htxDims: [hw, hh] });
          continue;
        }

        // ── Dimension ratios & size score ──
        // Use the dominant (max) dimension to avoid padding artifacts on thin diagrams.
        // For tiny images (both dims < 100px), skip size penalty entirely.
        const wRatio = hw / aw;
        const hRatio = hh / ah;
        const SIGMA = 0.15;
        let sizeScore;
        if (aw < 100 && ah < 100) {
          sizeScore = 1.0;
        } else {
          const refMax = Math.max(aw, ah);
          const htxMax = Math.max(hw, hh);
          const maxRatio = htxMax / refMax;
          sizeScore = Math.exp(-((maxRatio - 1) ** 2) / (2 * SIGMA * SIGMA));
        }

        // ── Content SSIM: trim white borders, resize both to same dimensions ──
        // Trimming removes bounding box padding so SSIM compares only drawn content.
        // Both images are resized to the same target size (no padding) so that
        // content aligns pixel-for-pixel. Size difference is already captured by sizeScore.
        const MAX = 400;
        const trimRef = await sharp(path.join(TEXER_DIR, id + '.png'))
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .trim({ threshold: 20 })
          .toBuffer({ resolveWithObject: true });
        const trimHtx = await sharp(path.join(HTX_DIR, id + '.png'))
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .trim({ threshold: 20 })
          .toBuffer({ resolveWithObject: true });

        const tw1 = trimRef.info.width, th1 = trimRef.info.height;
        const tw2 = trimHtx.info.width, th2 = trimHtx.info.height;
        const maxW = Math.max(tw1, tw2);
        const maxH = Math.max(th1, th2);
        const scale = Math.min(MAX / maxW, MAX / maxH, 1);
        const targetW = Math.max(Math.round(maxW * scale), 11);
        const targetH = Math.max(Math.round(maxH * scale), 11);

        const refBuf = await sharp(trimRef.data)
          .resize(targetW, targetH, { fit: 'fill' })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        let htxBuf = await sharp(trimHtx.data)
          .resize(targetW, targetH, { fit: 'fill' })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        // Guard: sharp may produce off-by-one dimensions; re-resize to match
        const w = refBuf.info.width, h = refBuf.info.height;
        if (htxBuf.info.width !== w || htxBuf.info.height !== h) {
          htxBuf = await sharp(htxBuf.data, { raw: { width: htxBuf.info.width, height: htxBuf.info.height, channels: 3 } })
            .resize(w, h, { fit: 'fill' })
            .raw().toBuffer({ resolveWithObject: true });
        }

        const refImg = { data: rgbToRgba(refBuf.data, w, h), width: w, height: h };
        const htxImg = { data: rgbToRgba(htxBuf.data, w, h), width: w, height: h };

        const { mssim: rawSsim } = computeSSIM(refImg, htxImg);

        // Soft SSIM: blur both images before comparing. Pixel-wise SSIM is not
        // shift-invariant, and for thin strokes a small misalignment can produce
        // anti-correlated windows (negative SSIM) even when the diagrams are
        // nearly identical. A Gaussian blur widens strokes enough that minor
        // shifts still overlap. We compute SSIM at two blur levels and take the
        // max with the raw score, so a truly different diagram (which fails at
        // every level) still scores low, but thin-strip misalignment is forgiven.
        // Scale both sigmas with image size so the same fractional blur is applied
        // regardless of resolution; clamp so small images still get ≥1.5 px blur.
        const minDim = Math.min(w, h);
        const softSigmaA = Math.min(Math.max(minDim * 0.025, 1.5), 4);
        const softSigmaB = Math.min(Math.max(minDim * 0.08, 3), 10);
        async function ssimBlurred(sigma) {
          const refS = await sharp(refBuf.data, { raw: { width: w, height: h, channels: 3 } })
            .blur(sigma).raw().toBuffer();
          const htxS = await sharp(htxBuf.data, { raw: { width: w, height: h, channels: 3 } })
            .blur(sigma).raw().toBuffer();
          return computeSSIM(
            { data: rgbToRgba(refS, w, h), width: w, height: h },
            { data: rgbToRgba(htxS, w, h), width: w, height: h }
          ).mssim;
        }
        const softSsimA = await ssimBlurred(softSigmaA);
        const softSsimB = await ssimBlurred(softSigmaB);
        const softSsim = Math.max(softSsimA, softSsimB);

        const mssim = Math.max(rawSsim, softSsim);
        const combined = mssim * sizeScore;

        results.push({ id, idx, corpusFile, ssim: mssim, rawSsim, softSsim, sizeScore, combined,
          wRatio, hRatio, refDims: [aw, ah], htxDims: [hw, hh] });
      } catch (e) {
        results.push({ id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1, error: e.message });
      }

      if ((pi + 1) % 100 === 0)
        console.log(`  ${pi + 1}/${pairs.length}`);
    }

    results.sort((a, b) => a.combined - b.combined);
    fs.writeFileSync(path.join(OUT_DIR, 'ssim-results.json'), JSON.stringify(results, null, 2));

    console.log(`  Saved ${results.length} results to comparison/ssim-results.json`);
    console.log(`  Worst 10:`);
    for (const r of results.slice(0, 10))
      console.log(`    #${r.id} (${r.corpusFile}) combined=${r.combined.toFixed(4)} ssim=${r.ssim.toFixed(4)} size=${r.sizeScore.toFixed(4)}${r.error ? ' ' + r.error : ''}`);
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

    const sc = r => r.combined != null ? r.combined : r.ssim;
    const statsGood = results.filter(r => sc(r) >= 0.95).length;
    const statsFair = results.filter(r => sc(r) >= 0.85 && sc(r) < 0.95).length;
    const statsPoor = results.filter(r => sc(r) >= 0 && sc(r) < 0.85).length;
    const statsErr  = results.filter(r => sc(r) < 0).length;

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
    <span class="badge" style="background:${ssimColor(r.combined != null ? r.combined : r.ssim)}">Combined ${(r.combined != null && r.combined >= 0) ? r.combined.toFixed(4) : (r.ssim >= 0 ? r.ssim.toFixed(4) : 'N/A')} &middot; ${ssimLabel(r.combined != null ? r.combined : r.ssim)}</span>
    <span class="badge" style="background:${ssimColor(r.ssim)};margin-left:4px">Content ${(r.ssim >= 0 ? r.ssim.toFixed(4) : 'N/A')}</span>
    ${r.rawSsim != null ? `<span class="badge" style="background:${ssimColor(r.rawSsim)};margin-left:4px" title="Pixel-wise SSIM (no blur)">Raw ${r.rawSsim.toFixed(4)}</span>` : ''}
    ${r.softSsim != null ? `<span class="badge" style="background:${ssimColor(r.softSsim)};margin-left:4px" title="SSIM after Gaussian blur (shift-tolerant)">Soft ${r.softSsim.toFixed(4)}</span>` : ''}
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
.card-body{display:grid;grid-template-columns:35% 35% 30%;gap:0}
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
      const fpath = path.join(OUT_DIR, fname);
      for (let _retry = 0; _retry < 5; _retry++) {
        try { fs.writeFileSync(fpath, html); break; }
        catch(e) {
          if (_retry === 4) { console.warn(`  Warning: failed to write ${fname} after 5 retries: ${e.code}`); }
          else { const t=Date.now(); while(Date.now()-t<200*(_retry+1)); }
        }
      }
    }

    // page-1.html alias
    if (totalPages > 0 && fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
      fs.copyFileSync(path.join(OUT_DIR, 'index.html'), path.join(OUT_DIR, 'page-1.html'));
    }

    console.log(`  Wrote ${totalPages} pages\n`);
  }

  // Regenerate blink-manifest.json so the Blink Comparator stays in sync
  const manifestScript = path.join(OUT_DIR, 'generate-manifest.js');
  if (fs.existsSync(manifestScript)) {
    console.log('Regenerating blink-manifest.json...');
    require('child_process').execSync(`node "${manifestScript}"`, {stdio: 'inherit'});
  }

  console.log('Pipeline complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
