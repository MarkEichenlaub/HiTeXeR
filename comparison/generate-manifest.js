'use strict';
const fs = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
// Read from asy_corpus to preserve original filenames (cXX_L...); asy_src uses
// numeric IDs that lose collection info.
const CORPUS_DIR = path.join(ROOT, 'asy_corpus');
const OUT_DIR    = __dirname;                        // comparison/
const ASY_DIR    = path.join(OUT_DIR, 'asy_pngs');
const HTX_DIR    = path.join(OUT_DIR, 'htx_pngs');
const TEXER_DIR  = path.join(OUT_DIR, 'texer_pngs');
const SVG_DIR    = path.join(OUT_DIR, 'htx_svgs');
const SSIM_FILE  = path.join(OUT_DIR, 'ssim-results.json');
const MANIFEST   = path.join(OUT_DIR, 'blink-manifest.json');

function numId(i) { return String(i + 1).padStart(5, '0'); }

// Course names by collection ID
const COURSE_NAMES = {
  // Math courses
  c4:   'Intermediate Algebra',
  c10:  'Precalculus',
  c36:  'Prealgebra',
  c51:  'Intro to Counting & Probability',
  c53:  'Intermediate Counting & Probability',
  c57:  'Introduction to Geometry',
  c71:  'Chemistry',
  c95:  'AMC 10 Problem Series',
  c134: 'MATHWOOT',
  c186: 'Trigonometry',
  c282: 'Prealgebra 1',
  c289: 'Introduction to Geometry (old)',
  c321: 'Algebra A',
  c398: 'Algebra 1',
  c401: 'Prealgebra 2',
  c402: 'AMC 8 Basics',
  c462: 'Intro to Number Theory',
  c463: 'MATHWOOT 2',
  c510: 'USACO Silver',
  c582: 'Introduction to Geometry (v2)',
  c583: 'USACO Bronze',
  c647: 'USACO Gold',
  // Physics courses
  c175: 'PhysicsWOOT 1',
  c190: 'F=ma Problem Series',
  c191: 'PhysicsWOOT 2',
  c268: 'Introduction to Physics',
  c400: 'Physics Seminar: Relativity',
  c405: 'Physics 1: Mechanics',
  c441: 'Relativity Camp',
  c442: 'Physics 2',
  c539: 'Middle School Physics 1',
  c540: 'Middle School Physics 2',
  // Expansion courses (re-scan 2026-06)
  c227: 'Accelerated Counting & Probability',
  c662: 'AMC 12 Problem Series',
  // Asymptote gallery
  gallery:           'Asymptote Gallery',
  gallery_2Dgraphs:  'Asymptote Gallery: 2Dgraphs',
  gallery_3Dgraphs:  'Asymptote Gallery: 3Dgraphs',
  gallery_3Dwebgl:   'Asymptote Gallery: 3Dwebgl',
  gallery_IBL:       'Asymptote Gallery: IBL',
  gallery_animations: 'Asymptote Gallery: animations',
};

// ── Stable, append-only corpus numbering ──────────────────────────────────
// Numeric ids (00001..) map to corpus files by their POSITION in the canonical
// ordered list comparison/corpus-ids.json — NOT by re-sorting the directory on
// every run. This is load-bearing: the expensive texer_pngs/asy_src/htx_pngs are
// keyed by numeric id, so re-sorting (the old `readdirSync().sort()` scheme)
// would renumber every id whenever a file is added and orphan all those PNGs.
// New files are APPENDED at the end (new ids); existing ids never move; a file
// removed from disk keeps its slot reserved (emits no diagram) so nothing shifts.
const IDS_FILE = path.join(OUT_DIR, 'corpus-ids.json');
const corpusOnDisk = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy'));
const onDiskSet = new Set(corpusOnDisk);
let corpusOrder = [];
try { corpusOrder = JSON.parse(fs.readFileSync(IDS_FILE, 'utf-8')); } catch {}
if (!corpusOrder.length) {
  // Bootstrap from sorted order (reproduces the legacy positional ids exactly).
  corpusOrder = [...corpusOnDisk].sort();
  fs.writeFileSync(IDS_FILE, JSON.stringify(corpusOrder, null, 0));
}
const knownFiles = new Set(corpusOrder);
const newFiles = corpusOnDisk.filter(f => !knownFiles.has(f)).sort();
if (newFiles.length) {
  const firstNew = corpusOrder.length;
  corpusOrder = corpusOrder.concat(newFiles);
  fs.writeFileSync(IDS_FILE, JSON.stringify(corpusOrder, null, 0));
  console.log(`Appended ${newFiles.length} new corpus file(s) -> ids ${numId(firstNew)}..${numId(corpusOrder.length - 1)}`);
}
console.log(`Corpus: ${corpusOnDisk.length} .asy files on disk, ${corpusOrder.length} numbered slots`);

// Read excluded (dropped) diagram IDs
const DROPLIST_FILE = path.join(ROOT, 'auto-fix', 'droplist.json');
let droppedIds = [];
try { if (fs.existsSync(DROPLIST_FILE)) droppedIds = JSON.parse(fs.readFileSync(DROPLIST_FILE, 'utf-8')); } catch {}
const droppedSet = new Set(droppedIds.map(id => String(id).padStart(5, '0')));
if (droppedSet.size) console.log(`Excluded: ${droppedSet.size} diagram(s)`);

// Build sets of existing PNGs/SVGs
const asySet   = new Set(fs.readdirSync(ASY_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
const htxSet   = new Set(fs.readdirSync(HTX_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
const svgSet   = new Set(fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg')).map(f => f.replace('.svg', '')));
const texerSet = new Set(fs.readdirSync(TEXER_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));

console.log(`asy_pngs: ${asySet.size}, htx_pngs: ${htxSet.size}, htx_svgs: ${svgSet.size}, texer_pngs: ${texerSet.size}`);

// Build SSIM lookup  { id -> { ssim, corpusFile } }
const ssimLookup = {};
if (fs.existsSync(SSIM_FILE)) {
  const ssimData = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf-8'));
  for (const entry of ssimData) {
    ssimLookup[entry.id] = { ssim: entry.ssim, combined: entry.combined ?? null, sizeScore: entry.sizeScore ?? null, corpusFile: entry.corpusFile || null };
  }
  console.log(`SSIM scores: ${ssimData.length}`);
}

// Extract collection from filename:
//   "c{N}_L{N}_{type}_{idx}.asy" -> "c{N}"
//   "gallery_{subdir}_{name}.asy" -> "gallery_{subdir}" (or "gallery" for root)
function getCollection(filename) {
  const cm = filename.match(/^(c\d+)_/);
  if (cm) return cm[1];
  const gm = filename.match(/^gallery_([A-Za-z0-9]+)_/);
  if (gm) return `gallery_${gm[1]}`;
  if (filename.startsWith('gallery_')) return 'gallery';
  return 'unknown';
}

// Build diagrams array. Files in asy_corpus are sorted and mapped to
// numeric IDs 00001..NNNNN matching the rendered PNGs in htx_pngs/texer_pngs.
const collectionsSet = new Set();
const diagrams = [];

let epsCount = 0;
for (let i = 0; i < corpusOrder.length; i++) {
  const source = corpusOrder[i];
  if (!onDiskSet.has(source)) continue;  // retired slot — keep id reserved, emit nothing
  const id = numId(i);
  const ssimEntry = ssimLookup[id];
  const collection = getCollection(source);
  collectionsSet.add(collection);

  // Flag diagrams that embed an external EPS image via graphic("….eps").
  // This drives the virtual "eps" collection in the comparator. Computed here
  // (not in blink.html) so it is regenerated on every manifest rebuild and can
  // never silently disappear after a full-pipeline run or git reset.
  let hasEps = false;
  try { hasEps = /\.eps\b/i.test(fs.readFileSync(path.join(CORPUS_DIR, source), 'utf-8')); } catch {}
  if (hasEps) epsCount++;

  diagrams.push({
    id,
    source,
    collection,
    hasEps,
    hasAsy:  asySet.has(id),
    hasHtx:  htxSet.has(id),
    hasSvg:  svgSet.has(id),
    hasTexer: texerSet.has(id),
    ssim:     ssimEntry !== undefined ? ssimEntry.ssim     : null,
    combined: ssimEntry !== undefined ? ssimEntry.combined : null,
    sizeScore: ssimEntry !== undefined ? ssimEntry.sizeScore : null,
  });
}

// ── External-source collections (ext:*) ──────────────────────────────────
// Append-only. These live in asy_corpus_ext/ with STRING ids (the filename
// stem, e.g. ext_tutorial_intro), so they never perturb the positional numeric
// ids of asy_corpus — adding/removing them can never renumber the main corpus
// or invalidate its texer_pngs. Collection = "ext:<source>" from the filename.
const EXT_DIR = path.join(ROOT, 'asy_corpus_ext');
// Display names with NO "ext:" prefix — these collections live under the "ext"
// category in the comparator tree, so the category header already conveys it.
const EXT_NAMES = {
  manual:   'Asymptote manual',
  tutorial: 'Asymptote Tutorial (official)',
  staats:   'Staats — An Asymptote Tutorial',
  asytug:   'Bowman — Asymptote (TUGboat)',
};
if (fs.existsSync(EXT_DIR)) {
  const extFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.asy')).sort();
  for (const source of extFiles) {
    const id = source.replace(/\.asy$/, '');
    const m = id.match(/^ext_([a-z0-9]+)_/);
    const collection = m ? `ext:${m[1]}` : 'ext:other';
    collectionsSet.add(collection);
    let hasEps = false;
    try { hasEps = /\.eps\b/i.test(fs.readFileSync(path.join(EXT_DIR, source), 'utf-8')); } catch {}
    if (hasEps) epsCount++;
    const ssimEntry = ssimLookup[id];
    diagrams.push({
      id, source, collection, hasEps,
      hasAsy:  asySet.has(id),
      hasHtx:  htxSet.has(id),
      hasSvg:  svgSet.has(id),
      hasTexer: texerSet.has(id),
      ssim:     ssimEntry !== undefined ? ssimEntry.ssim     : null,
      combined: ssimEntry !== undefined ? ssimEntry.combined : null,
      sizeScore: ssimEntry !== undefined ? ssimEntry.sizeScore : null,
    });
  }
  console.log(`Ext: ${extFiles.length} external-source diagram(s)`);
}

// Sort collections: cN numerically, then ext:* / gallery_* / other, then anything else.
const collections = [...collectionsSet].sort((a, b) => {
  const aC = /^c\d+$/.test(a), bC = /^c\d+$/.test(b);
  if (aC && bC) return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  if (aC) return -1;
  if (bC) return 1;
  return a.localeCompare(b);
});

// Virtual "eps" collection: a cross-cutting group of every diagram that embeds
// an EPS image, regardless of its course. Appended last so it sorts after the
// real cN/gallery collections. blink.html filters it via the per-diagram
// `hasEps` flag rather than `collection === 'eps'`.
if (epsCount > 0) collections.push('eps');

// Virtual "norender" collection: every diagram that produces NO HiTeXeR output
// (no htx_png ⇒ blank on the HiTeXeR side of the comparator). One-off special
// bucket the user opts into; members stay in their home collection too. Filtered
// in blink.html via `!d.hasHtx`, like eps. Appended dead last.
const norenderCount = diagrams.filter(d => !d.hasHtx).length;
if (norenderCount > 0) collections.push('norender');

// Build courseNames for collections that have names
const courseNames = {};
for (const c of collections) {
  if (COURSE_NAMES[c]) courseNames[c] = COURSE_NAMES[c];
  else if (c.startsWith('ext:')) courseNames[c] = EXT_NAMES[c.slice(4)] || c;
}
if (epsCount > 0) courseNames['eps'] = 'EPS images';
if (norenderCount > 0) courseNames['norender'] = 'No HiTeXeR';

// ── Category grouping for the comparator's collection tree ─────────────────
// Physics / CS / Chemistry are explicit course sets; every other cN collection
// is Math; ext:* and gallery* group by prefix. eps + unknown stand alone
// (miscellaneous); norender is the special one-off bucket pinned at the bottom.
const PHYSICS_COLLS = new Set(['c175','c190','c191','c268','c400','c405','c441','c442','c539','c540']);
const CS_COLLS      = new Set(['c510','c583','c647']);
const CHEM_COLLS    = new Set(['c71']);
function categoryOf(c) {
  if (c.startsWith('ext:'))     return 'ext';
  if (c.startsWith('gallery'))  return 'Gallery';
  if (PHYSICS_COLLS.has(c))     return 'Physics';
  if (CS_COLLS.has(c))          return 'CS';
  if (CHEM_COLLS.has(c))        return 'Chemistry';
  if (/^c\d+$/.test(c))         return 'Math';
  return null;  // eps / unknown / norender — handled standalone
}
const CATEGORY_ORDER = ['Physics', 'CS', 'Chemistry', 'Math', 'ext', 'Gallery'];
const categories = CATEGORY_ORDER
  .map(name => ({ name, cols: collections.filter(c => categoryOf(c) === name) }))
  .filter(g => g.cols.length);
const standaloneCols = collections.filter(c => c === 'eps' || c === 'unknown');
const specialCols    = collections.filter(c => c === 'norender');

const manifest = { diagrams, collections, courseNames, categories, standaloneCols, specialCols, droppedIds: [...droppedSet] };
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${MANIFEST}`);

// Refresh comparison/random-ids.json (drives the comparator's "random — SSIM
// not meaningful" warning and the canary RNG exclusion). Cheap; keeps it current.
try {
  const { isRandomSource } = require(path.join(ROOT, 'auto-fix', 'random-detect.js'));
  const ASY_SRC = path.join(OUT_DIR, 'asy_src');
  const rndHits = fs.readdirSync(ASY_SRC).filter(f => f.endsWith('.asy'))
    .filter(f => { try { return isRandomSource(fs.readFileSync(path.join(ASY_SRC, f), 'utf8')); } catch { return false; } })
    .map(f => f.slice(0, -4)).sort();
  fs.writeFileSync(path.join(OUT_DIR, 'random-ids.json'), JSON.stringify(rndHits, null, 2) + '\n');
  console.log(`  random-ids.json: ${rndHits.length} RNG diagram(s)`);
} catch (e) { console.error('  random-ids regen failed: ' + e.message); }
console.log(`  ${diagrams.length} diagrams, ${collections.length} collections`);
console.log(`  Collections: ${collections.map(c => `${c} (${courseNames[c] || '?'})`).join(', ')}`);
