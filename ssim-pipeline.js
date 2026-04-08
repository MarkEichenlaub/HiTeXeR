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

// ── Metric helpers ──────────────────────────────────────────────

/** Convert 3-channel RGB raw buffer to single-channel greyscale Uint8Array */
function rgbToGrey(buf, w, h) {
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = Math.round(0.299 * buf[i * 3] + 0.587 * buf[i * 3 + 1] + 0.114 * buf[i * 3 + 2]);
  }
  return grey;
}

/** Binarize an RGB raw buffer to ink map: 1 = ink, 0 = background */
function binarize(buf, w, h, threshold = 240) {
  const grey = rgbToGrey(buf, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = grey[i] < threshold ? 1 : 0;
  }
  return out;
}

/** IoU of two binary Uint8Arrays (same length) */
function binaryIoU(mapA, mapB, len) {
  let inter = 0, union = 0;
  for (let i = 0; i < len; i++) {
    const a = mapA[i], b = mapB[i];
    if (a || b) { union++; if (a && b) inter++; }
  }
  return union === 0 ? 1.0 : inter / union;
}

/** Compute IoU between two RGB raw buffers (binarized at threshold) */
function computeIoU(asyBuf, htxBuf, w, h, threshold = 240) {
  const asyBin = binarize(asyBuf, w, h, threshold);
  const htxBin = binarize(htxBuf, w, h, threshold);
  return binaryIoU(asyBin, htxBin, w * h);
}

/** Sobel edge detection on greyscale buffer, returns binary edge map */
function manualSobelEdge(greyBuf, w, h, edgeThreshold = 30) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      // Sobel X kernel
      const gx =
        -greyBuf[(y - 1) * w + (x - 1)] + greyBuf[(y - 1) * w + (x + 1)]
        - 2 * greyBuf[y * w + (x - 1)] + 2 * greyBuf[y * w + (x + 1)]
        - greyBuf[(y + 1) * w + (x - 1)] + greyBuf[(y + 1) * w + (x + 1)];
      // Sobel Y kernel
      const gy =
        -greyBuf[(y - 1) * w + (x - 1)] - 2 * greyBuf[(y - 1) * w + x] - greyBuf[(y - 1) * w + (x + 1)]
        + greyBuf[(y + 1) * w + (x - 1)] + 2 * greyBuf[(y + 1) * w + x] + greyBuf[(y + 1) * w + (x + 1)];
      const mag = Math.sqrt(gx * gx + gy * gy);
      out[idx] = mag >= edgeThreshold ? 1 : 0;
    }
  }
  return out;
}

/** Connected-component count using union-find, filtering components with area > minArea */
function countComponents(binaryBuf, w, h, minArea = 10) {
  const n = w * h;
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  parent.fill(-1); // -1 = not part of any component

  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }

  function unite(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) { const t = a; a = b; b = t; }
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  }

  // Initialize parent for ink pixels
  for (let i = 0; i < n; i++) {
    if (binaryBuf[i]) parent[i] = i;
  }

  // Connect 4-neighbors
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binaryBuf[idx]) continue;
      if (x + 1 < w && binaryBuf[idx + 1]) unite(idx, idx + 1);
      if (y + 1 < h && binaryBuf[idx + w]) unite(idx, idx + w);
    }
  }

  // Count components by area
  const areaCounts = {};
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0) continue;
    const root = find(i);
    areaCounts[root] = (areaCounts[root] || 0) + 1;
  }

  let count = 0;
  for (const root in areaCounts) {
    if (areaCounts[root] >= minArea) count++;
  }
  return count;
}

/** Compute dHash (difference hash) from a PNG buffer via Sharp. Returns 64-bit BigInt. */
async function computeDHash(pngBuf) {
  // Resize to 9x8 greyscale
  const raw = await sharp(pngBuf)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << BigInt(y * 8 + x);
      }
    }
  }
  return hash;
}

/** Hamming distance between two 64-bit BigInt hashes */
function hammingDistance(h1, h2) {
  let xor = h1 ^ h2;
  let count = 0;
  while (xor) { xor &= xor - 1n; count++; }
  return count;
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
    console.log('Rasterizing HiTeXeR SVGs to PNGs...');
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
        const svgBuf = fs.readFileSync(path.join(SVG_DIR, sf));
        await sharp(svgBuf, { density: 320 }).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toFile(outPng);
        ok++;
      } catch (e) { fail++; }

      if ((ok + fail) % 200 === 0)
        console.log(`  ${ok + fail}/${svgFiles.length}  ok=${ok} fail=${fail}`);
    }
    console.log(`  Done: ok=${ok} fail=${fail}\n`);
  }

  // ── Step 4: Compute metrics ──────────────────────────────────
  if (STEPS.has('ssim')) {
    console.log('Computing comparison metrics...');
    const { ssim: computeSSIM } = require('ssim.js');

    const WHITE = { r: 255, g: 255, b: 255 };
    const TRIM_THRESHOLD = 20;
    const MIN_DIM = 11;
    const TARGET = 400;

    /** Preprocess a pair of images: trim, normalize, pad to same canvas.
     *  Returns { asyRaw, htxRaw, asyPadPng, htxPadPng, w, h, asyTrimW, asyTrimH, htxTrimW, htxTrimH }
     *  or null with an error string. */
    async function preprocessPair(asyPath, htxPath) {
      const asyTrimBuf = await sharp(asyPath)
        .flatten({ background: WHITE })
        .trim({ threshold: TRIM_THRESHOLD })
        .removeAlpha().png().toBuffer();
      const htxTrimBuf = await sharp(htxPath)
        .flatten({ background: WHITE })
        .trim({ threshold: TRIM_THRESHOLD })
        .removeAlpha().png().toBuffer();

      const asyTrimMeta = await sharp(asyTrimBuf).metadata();
      const htxTrimMeta = await sharp(htxTrimBuf).metadata();
      const asyTrimW = asyTrimMeta.width, asyTrimH = asyTrimMeta.height;
      const htxTrimW = htxTrimMeta.width, htxTrimH = htxTrimMeta.height;

      if (asyTrimW < MIN_DIM || asyTrimH < MIN_DIM ||
          htxTrimW < MIN_DIM || htxTrimH < MIN_DIM) {
        return null; // too small
      }

      const aspectAsy = asyTrimW / asyTrimH;
      const aspectHtx = htxTrimW / htxTrimH;
      const aspect = Math.max(aspectAsy, aspectHtx);
      let canvasW, canvasH;
      if (aspect >= 1) {
        canvasW = TARGET;
        canvasH = Math.max(Math.round(TARGET / aspect), MIN_DIM);
      } else {
        canvasH = TARGET;
        canvasW = Math.max(Math.round(TARGET * aspect), MIN_DIM);
      }

      const asyFitScale = Math.min(canvasW / asyTrimW, canvasH / asyTrimH);
      const asyW = Math.max(Math.round(asyTrimW * asyFitScale), 1);
      const asyH = Math.max(Math.round(asyTrimH * asyFitScale), 1);

      const htxFitScale = Math.min(canvasW / htxTrimW, canvasH / htxTrimH);
      const htxW = Math.max(Math.round(htxTrimW * htxFitScale), 1);
      const htxH = Math.max(Math.round(htxTrimH * htxFitScale), 1);

      const asyPadSharp = sharp(asyTrimBuf)
        .resize(asyW, asyH, { fit: 'fill' })
        .extend({
          top: Math.round((canvasH - asyH) / 2),
          bottom: canvasH - asyH - Math.round((canvasH - asyH) / 2),
          left: Math.round((canvasW - asyW) / 2),
          right: canvasW - asyW - Math.round((canvasW - asyW) / 2),
          background: WHITE
        })
        .removeAlpha();

      const htxPadSharp = sharp(htxTrimBuf)
        .resize(htxW, htxH, { fit: 'fill' })
        .extend({
          top: Math.round((canvasH - htxH) / 2),
          bottom: canvasH - htxH - Math.round((canvasH - htxH) / 2),
          left: Math.round((canvasW - htxW) / 2),
          right: canvasW - htxW - Math.round((canvasW - htxW) / 2),
          background: WHITE
        })
        .removeAlpha();

      // Get raw RGB buffers and PNG buffers (PNG needed for dHash)
      const [asyRaw, htxRaw, asyPadPng, htxPadPng] = await Promise.all([
        asyPadSharp.clone().raw().toBuffer({ resolveWithObject: true }),
        htxPadSharp.clone().raw().toBuffer({ resolveWithObject: true }),
        asyPadSharp.clone().png().toBuffer(),
        htxPadSharp.clone().png().toBuffer(),
      ]);

      const w = asyRaw.info.width, h = asyRaw.info.height;

      return { asyRaw, htxRaw, asyPadPng, htxPadPng, w, h, asyTrimW, asyTrimH, htxTrimW, htxTrimH };
    }

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
        const pp = await preprocessPair(
          path.join(ASY_DIR, id + '.png'),
          path.join(HTX_DIR, id + '.png')
        );

        if (!pp) {
          results.push({ id, idx, corpusFile, ssim: -1, iou: -1, edgeIou: -1, aspectSim: -1, componentRatio: -1, dhashSim: -1, score: -1, error: 'Image too small' });
          continue;
        }

        const { asyRaw, htxRaw, asyPadPng, htxPadPng, w, h, asyTrimW, asyTrimH, htxTrimW, htxTrimH } = pp;

        // 1) SSIM
        const asyImg = { data: rgbToRgba(asyRaw.data, w, h), width: w, height: h };
        const htxImg = { data: rgbToRgba(htxRaw.data, w, h), width: w, height: h };
        const { mssim } = computeSSIM(asyImg, htxImg);

        // 2) IoU (binarized ink overlap)
        const iou = computeIoU(asyRaw.data, htxRaw.data, w, h);

        // 3) Edge IoU (Sobel edge map overlap)
        const asyGrey = rgbToGrey(asyRaw.data, w, h);
        const htxGrey = rgbToGrey(htxRaw.data, w, h);
        const asyEdge = manualSobelEdge(asyGrey, w, h);
        const htxEdge = manualSobelEdge(htxGrey, w, h);
        const edgeIou = binaryIoU(asyEdge, htxEdge, w * h);

        // 4) Aspect ratio similarity
        const arAsy = asyTrimW / asyTrimH;
        const arHtx = htxTrimW / htxTrimH;
        const aspectSim = 1 - Math.abs(arAsy - arHtx) / Math.max(arAsy, arHtx);

        // 5) Connected component ratio
        const asyBin = binarize(asyRaw.data, w, h);
        const htxBin = binarize(htxRaw.data, w, h);
        const asyCC = countComponents(asyBin, w, h);
        const htxCC = countComponents(htxBin, w, h);
        const componentRatio = (asyCC === 0 && htxCC === 0) ? 1.0
          : Math.min(asyCC, htxCC) / Math.max(asyCC, htxCC);

        // 6) dHash similarity
        const [asyHash, htxHash] = await Promise.all([
          computeDHash(asyPadPng),
          computeDHash(htxPadPng),
        ]);
        const dhashSim = 1 - hammingDistance(asyHash, htxHash) / 64;

        // Composite score
        const clampedSsim = Math.max(0, Math.min(1, mssim));
        const score = 0.35 * iou + 0.30 * edgeIou + 0.15 * clampedSsim
          + 0.10 * componentRatio + 0.05 * aspectSim + 0.05 * dhashSim;

        results.push({
          id, idx, corpusFile,
          ssim: mssim,
          iou: Math.round(iou * 10000) / 10000,
          edgeIou: Math.round(edgeIou * 10000) / 10000,
          aspectSim: Math.round(aspectSim * 10000) / 10000,
          componentRatio: Math.round(componentRatio * 10000) / 10000,
          dhashSim: Math.round(dhashSim * 10000) / 10000,
          score: Math.round(score * 10000) / 10000,
        });
      } catch (e) {
        results.push({ id, idx, corpusFile, ssim: -1, iou: -1, edgeIou: -1, aspectSim: -1, componentRatio: -1, dhashSim: -1, score: -1, error: e.message });
      }

      if ((pi + 1) % 100 === 0)
        console.log(`  ${pi + 1}/${pairs.length}`);
    }

    results.sort((a, b) => a.score - b.score);
    fs.writeFileSync(path.join(OUT_DIR, 'ssim-results.json'), JSON.stringify(results, null, 2));

    console.log(`  Saved ${results.length} results to comparison/ssim-results.json`);
    console.log(`  Worst 10:`);
    for (const r of results.slice(0, 10))
      console.log(`    #${r.id} (${r.corpusFile}) Score=${r.score.toFixed(4)} SSIM=${r.ssim.toFixed(4)} IoU=${r.iou.toFixed(4)} Edge=${r.edgeIou.toFixed(4)}${r.error ? ' ' + r.error : ''}`);
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

    function scoreColor(v) {
      if (v < 0) return '#999';
      if (v >= 0.85) return '#2d8a4e';
      if (v >= 0.70) return '#6a9f2a';
      if (v >= 0.50) return '#c0820a';
      return '#c0392b';
    }

    function scoreLabel(v) {
      if (v < 0) return 'Error';
      if (v >= 0.85) return 'Good';
      if (v >= 0.70) return 'Fair';
      if (v >= 0.50) return 'Poor';
      return 'Bad';
    }

    function fmtMetric(v) { return v < 0 ? 'N/A' : v.toFixed(2); }

    const statsGood = results.filter(r => r.score >= 0.85).length;
    const statsFair = results.filter(r => r.score >= 0.70 && r.score < 0.85).length;
    const statsPoor = results.filter(r => r.score >= 0 && r.score < 0.70).length;
    const statsErr  = results.filter(r => r.score < 0).length;

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
    <span class="metrics-row">Score ${fmtMetric(r.score)} | SSIM ${fmtMetric(r.ssim)} | IoU ${fmtMetric(r.iou)} | Edge ${fmtMetric(r.edgeIou)} | CC ${fmtMetric(r.componentRatio)} | AR ${fmtMetric(r.aspectSim)} | dHash ${fmtMetric(r.dhashSim)}</span>
    <span class="badge" style="background:${scoreColor(r.score)}">Score ${fmtMetric(r.score)} &middot; ${scoreLabel(r.score)}</span>
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
.metrics-row{font-size:.7em;opacity:0.7;white-space:nowrap;font-family:Consolas,monospace}
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
<p class="sub">${results.length} diagrams sorted by composite score (worst first) — Page ${pageNum} of ${totalPages}</p>
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
