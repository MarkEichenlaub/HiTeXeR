'use strict';
/**
 * eps-cache.js
 *
 * Persistent on-disk EPS→PNG cache shared by render-hitexer.js,
 * recompute-htx.js, and (via the same directory layout) server.py.
 *
 * Layout under comparison/eps_cache/:
 *   index.json            { "<aops-path>": { fname, width_bp, height_bp } | { error } }
 *   <hash>__<base>.png    rasterised PNG (binary)
 *
 * AoPS-local paths look like
 *     /var/www/cdn/school/crypt/<HASH>/files/<name>.eps
 * which maps to the public CDN URL
 *     http://cdn.artofproblemsolving.com/school/crypt/<HASH>/files/<name>.eps
 *
 * Public API:
 *   getImageCache(paths)   – sync; downloads + converts any missing entries,
 *                            writes them to disk, returns
 *                            { [path]: { png_b64, width_bp, height_bp } | { error } }
 *   loadIndex() / saveIndex()
 *   findGhostscript()
 */

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const http     = require('http');
const https    = require('https');
const { URL }  = require('url');
const { spawnSync } = require('child_process');

const CACHE_DIR  = path.join(__dirname, 'comparison', 'eps_cache');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

const AOPS_CDN_LOCAL = '/var/www/cdn';
const AOPS_CDN_URL   = 'http://cdn.artofproblemsolving.com';
const AOPS_PATH_RE   = /\/var\/www\/cdn\/[^\s"'\\)]+/g;

// ── Filesystem helpers ────────────────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadIndex() {
  ensureDir();
  if (!fs.existsSync(INDEX_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function saveIndex(index) {
  ensureDir();
  // Stable key order so diffs stay readable when committed
  const keys = Object.keys(index).sort();
  const ordered = {};
  for (const k of keys) ordered[k] = index[k];
  fs.writeFileSync(INDEX_FILE, JSON.stringify(ordered, null, 2));
}

function safeFilename(aopsPath) {
  const hash = crypto.createHash('sha1').update(aopsPath).digest('hex').slice(0, 12);
  const baseRaw = path.basename(aopsPath, path.extname(aopsPath));
  const safe = baseRaw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'eps';
  return `${hash}__${safe}.png`;
}

// ── Ghostscript locator ───────────────────────────────────────────────────
function findGhostscript() {
  if (process.env.GHOSTSCRIPT && fs.existsSync(process.env.GHOSTSCRIPT)) {
    return process.env.GHOSTSCRIPT;
  }
  const winRoot1 = process.env['ProgramFiles']      || 'C:\\Program Files';
  const winRoot2 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [];
  for (const root of [winRoot1, winRoot2]) {
    const gsRoot = path.join(root, 'gs');
    if (!fs.existsSync(gsRoot)) continue;
    let entries;
    try { entries = fs.readdirSync(gsRoot); } catch (e) { continue; }
    // Sort newest-version first (string sort works for "gs10.06.0" style names)
    entries.sort().reverse();
    for (const v of entries) {
      candidates.push(path.join(gsRoot, v, 'bin', 'gswin64c.exe'));
      candidates.push(path.join(gsRoot, v, 'bin', 'gswin32c.exe'));
    }
  }
  // POSIX fallbacks
  candidates.push('/usr/bin/gs', '/usr/local/bin/gs');
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
}

// ── EPS bounding box parser (mirrors server.py:_eps_boundingbox) ──────────
function parseBoundingBox(epsPath) {
  let buf;
  try { buf = fs.readFileSync(epsPath); }
  catch (e) { return [100, 100]; }
  // Read up to first ~16 KB as latin1 text — bbox lines are always ASCII
  const head = buf.slice(0, 16384).toString('latin1');
  const lines = head.split(/\r?\n/).slice(0, 100);
  let llx=0, lly=0, urx=0, ury=0, found=false, hires=false;
  for (const line of lines) {
    if (line.startsWith('%%HiResBoundingBox:')) {
      const parts = line.slice('%%HiResBoundingBox:'.length).trim().split(/\s+/);
      if (parts.length >= 4) {
        const v = parts.slice(0,4).map(Number);
        if (v.every(x => Number.isFinite(x))) {
          [llx,lly,urx,ury] = v; hires = true; found = true;
        }
      }
    } else if (line.startsWith('%%BoundingBox:') && !hires) {
      const rest = line.slice('%%BoundingBox:'.length).trim();
      if (!rest.startsWith('(atend)')) {
        const parts = rest.split(/\s+/);
        if (parts.length >= 4) {
          const v = parts.slice(0,4).map(Number);
          if (v.every(x => Number.isFinite(x))) {
            [llx,lly,urx,ury] = v; found = true;
          }
        }
      }
    }
  }
  if (!found) return [100, 100];
  return [urx - llx, ury - lly];
}

// ── HTTP download (sync via spawnSync of node bootstrap, or use a worker) ──
// We need synchronous HTTP because render-hitexer.js / recompute-htx.js
// call A.render() synchronously. The simplest portable approach is to spawn
// curl. Fall back to node http module via spawnSync of node itself.
function downloadSync(url, destPath) {
  // Prefer system curl (ships on Win10+ and most Unix). It already follows
  // redirects with -L, has sane TLS, and writes directly to a file.
  const r = spawnSync('curl', [
    '-sSL', '--fail', '--max-time', '60',
    '-o', destPath, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status === 0 && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    return { ok: true };
  }
  const stderr = (r.stderr || '').toString().trim();
  return { ok: false, error: `curl failed (status ${r.status}): ${stderr || 'unknown'}` };
}

// ── Ghostscript EPS → PNG (mirrors server.py:_eps_to_png) ─────────────────
function convertEpsToPng(gsExe, epsPath, pngPath) {
  const r = spawnSync(gsExe, [
    '-dNOPAUSE', '-dBATCH', '-dSAFER',
    '-sDEVICE=png16m', '-r150', '-dEPSCrop',
    `-sOutputFile=${pngPath}`, epsPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  if (r.status === 0 && fs.existsSync(pngPath)) return { ok: true };
  const stderr = (r.stderr || '').toString().trim();
  return { ok: false, error: `gs failed (status ${r.status}): ${stderr.slice(0, 200) || 'unknown'}` };
}

// ── Main entry: synchronous batch resolve ─────────────────────────────────
//
// `paths` may be either an array of AoPS paths, or a string of asy source
// from which we'll regex-extract /var/www/cdn/... paths.
//
// Returns an object suitable for `imageCache` in `A.render({ imageCache })`:
//     { [path]: { png_b64, width_bp, height_bp } | { error } }
//
// Entries with errors are still returned so the caller can decide whether
// to fail; A.render() throws when it actually encounters such a path in
// graphic().
function getImageCache(paths, opts = {}) {
  const verbose = !!opts.verbose;

  let pathList;
  if (typeof paths === 'string') {
    pathList = [...new Set(paths.match(AOPS_PATH_RE) || [])];
  } else if (Array.isArray(paths)) {
    pathList = [...new Set(paths)];
  } else {
    pathList = [];
  }
  if (pathList.length === 0) return {};

  ensureDir();
  const index = loadIndex();
  const result = {};

  let gsExe = null;  // resolve lazily
  let dirty = false;

  for (const aopsPath of pathList) {
    const entry = index[aopsPath];
    // Cache hit: PNG already on disk
    if (entry && !entry.error && entry.fname) {
      const pngFile = path.join(CACHE_DIR, entry.fname);
      if (fs.existsSync(pngFile)) {
        const png = fs.readFileSync(pngFile);
        result[aopsPath] = {
          png_b64: png.toString('base64'),
          width_bp: entry.width_bp,
          height_bp: entry.height_bp,
        };
        continue;
      }
      // Stale index — fall through to refetch
    }
    // Cache hit: previously failed (don't re-attempt every run; user can
    // delete index.json or specific entry to retry)
    if (entry && entry.error && !opts.retryErrors) {
      result[aopsPath] = { error: entry.error };
      continue;
    }

    // Cache miss → fetch + convert
    if (!gsExe) {
      gsExe = findGhostscript();
      if (!gsExe) {
        const msg = 'Ghostscript not found (set GHOSTSCRIPT env var or install gs)';
        result[aopsPath] = { error: msg };
        index[aopsPath] = { error: msg };
        dirty = true;
        continue;
      }
    }

    const tmpEps = path.join(CACHE_DIR, '.' + safeFilename(aopsPath) + '.eps.tmp');
    const fname  = safeFilename(aopsPath);
    const pngOut = path.join(CACHE_DIR, fname);

    if (!aopsPath.startsWith(AOPS_CDN_LOCAL)) {
      const msg = 'Path is not an AoPS-local /var/www/cdn/ path';
      result[aopsPath] = { error: msg };
      index[aopsPath] = { error: msg };
      dirty = true;
      continue;
    }

    const url = AOPS_CDN_URL + aopsPath.slice(AOPS_CDN_LOCAL.length);
    if (verbose) process.stderr.write(`[eps-cache] fetch ${aopsPath}\n`);

    const dl = downloadSync(url, tmpEps);
    if (!dl.ok) {
      const msg = 'Download failed: ' + dl.error;
      result[aopsPath] = { error: msg };
      index[aopsPath] = { error: msg };
      dirty = true;
      try { fs.unlinkSync(tmpEps); } catch (e) {}
      continue;
    }

    const [width_bp, height_bp] = parseBoundingBox(tmpEps);

    const conv = convertEpsToPng(gsExe, tmpEps, pngOut);
    try { fs.unlinkSync(tmpEps); } catch (e) {}
    if (!conv.ok) {
      const msg = conv.error;
      result[aopsPath] = { error: msg };
      index[aopsPath] = { error: msg };
      dirty = true;
      continue;
    }

    const png = fs.readFileSync(pngOut);
    result[aopsPath] = {
      png_b64: png.toString('base64'),
      width_bp,
      height_bp,
    };
    index[aopsPath] = { fname, width_bp, height_bp };
    dirty = true;
  }

  if (dirty) saveIndex(index);
  return result;
}

module.exports = {
  CACHE_DIR,
  INDEX_FILE,
  AOPS_CDN_LOCAL,
  AOPS_CDN_URL,
  AOPS_PATH_RE,
  getImageCache,
  loadIndex,
  saveIndex,
  findGhostscript,
  safeFilename,
  parseBoundingBox,
};
