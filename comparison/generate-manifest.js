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
  c539: 'Middle School Physics 1',
  c540: 'Middle School Physics 2',
  // Asymptote gallery
  gallery:           'Asymptote Gallery',
  gallery_2Dgraphs:  'Asymptote Gallery: 2Dgraphs',
  gallery_3Dgraphs:  'Asymptote Gallery: 3Dgraphs',
  gallery_3Dwebgl:   'Asymptote Gallery: 3Dwebgl',
  gallery_IBL:       'Asymptote Gallery: IBL',
  gallery_animations: 'Asymptote Gallery: animations',
};

// Read corpus
const allFiles = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy')).sort();
console.log(`Corpus: ${allFiles.length} .asy files`);

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
    ssimLookup[entry.id] = { ssim: entry.ssim, corpusFile: entry.corpusFile || null };
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

for (let i = 0; i < allFiles.length; i++) {
  const source = allFiles[i];
  const id = numId(i);
  const ssimEntry = ssimLookup[id];
  const collection = getCollection(source);
  collectionsSet.add(collection);

  diagrams.push({
    id,
    source,
    collection,
    hasAsy:  asySet.has(id),
    hasHtx:  htxSet.has(id),
    hasSvg:  svgSet.has(id),
    hasTexer: texerSet.has(id),
    ssim:    ssimEntry !== undefined ? ssimEntry.ssim : null,
  });
}

// Sort collections: cN numerically, then gallery_*, then anything else.
const collections = [...collectionsSet].sort((a, b) => {
  const aC = /^c\d+$/.test(a), bC = /^c\d+$/.test(b);
  if (aC && bC) return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  if (aC) return -1;
  if (bC) return 1;
  return a.localeCompare(b);
});

// Build courseNames for collections that have names
const courseNames = {};
for (const c of collections) {
  if (COURSE_NAMES[c]) courseNames[c] = COURSE_NAMES[c];
}

const manifest = { diagrams, collections, courseNames };
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${MANIFEST}`);
console.log(`  ${diagrams.length} diagrams, ${collections.length} collections`);
console.log(`  Collections: ${collections.map(c => `${c} (${courseNames[c] || '?'})`).join(', ')}`);
