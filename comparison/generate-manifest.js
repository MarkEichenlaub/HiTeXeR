'use strict';
const fs = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const CORPUS_DIR = path.join(__dirname, 'asy_src');
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

// Extract collection from filename: "c{N}_L{N}_{type}_{idx}.asy" -> "c{N}"
function getCollection(filename) {
  const m = filename.match(/^(c\d+)_/);
  return m ? m[1] : 'unknown';
}

// Build diagrams array
const collectionsSet = new Set();
const diagrams = [];

for (let i = 0; i < allFiles.length; i++) {
  const source = allFiles[i];
  const id = source.replace(/\.asy$/, '');
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

// Sort collections naturally by numeric part
const collections = [...collectionsSet].sort((a, b) => {
  const na = parseInt(a.replace('c', ''), 10);
  const nb = parseInt(b.replace('c', ''), 10);
  return na - nb;
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
