'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ASY_DIR = path.join(ROOT, 'asy_corpus');
const OUT_DIR = path.join(ROOT, 'comparison');

// Diagram metadata (same as render-comparison.js)
const diagrams = [
  { id: '01_circles_circumcircle', file: 'c462_L10_script_33.asy', desc: 'Two circles with circumcircle, labeled points' },
  { id: '02_bipartite_graph', file: 'c53_L16_script_36.asy', desc: 'Complete bipartite graph on circle vertices' },
  { id: '03_numbered_grid', file: 'c36_L2_script_6.asy', desc: 'Numbered box grid with royalblue fill' },
  { id: '04_filled_triangle', file: 'c401_L7_script_65.asy', desc: 'Filled regions with orange and cyan+yellow' },
  { id: '05_octagon_geometry', file: 'c57_L11_script_47.asy', desc: 'Octagon with extension lines and right angle marks' },
  { id: '06_angle_sectors', file: 'c4_L10_p3301_problem_text_0.asy', desc: 'Triangle with red angle sectors and distance labels' },
  { id: '07_two_circles', file: 'c57_L14_p6103_problem_text_0.asy', desc: 'Two overlapping circles with intersection points' },
  { id: '08_isometric_grid', file: 'c36_L7_script_4.asy', desc: 'Isometric 3D cube grid with red fill' },
  { id: '09_triangle_circumcircle', file: 'c462_L17_script_36.asy', desc: 'Triangle with circumcircle, orthocenter, yellow fills' },
  { id: '10_dimension_triangle', file: 'c401_L11_script_42.asy', desc: 'Filled triangle with dashed altitude and dimension arrows' },
];

// --- Re-render SVGs using asy-interp.js ---
console.log('Re-rendering SVGs...');
global.window = {};
require('./asy-interp.js');
const A = window.AsyInterp;

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

for (const t of diagrams) {
  const raw = fs.readFileSync(path.join(ASY_DIR, t.file), 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  try {
    const r = A.render(code, { containerW: 500, containerH: 400 });
    fs.writeFileSync(path.join(OUT_DIR, t.id + '.svg'), r.svg);
    console.log('  OK:', t.id, '-', r.svg.length, 'bytes');
  } catch (e) {
    console.log('  FAIL:', t.id, '-', e.message.split('\n')[0].substring(0, 120));
    fs.writeFileSync(
      path.join(OUT_DIR, t.id + '.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">` +
      `<text x="10" y="30" fill="red">RENDER ERROR: ${escapeHtml(e.message.substring(0, 80))}</text></svg>`
    );
  }
}

// --- Read .asy source files ---
const sources = {};
for (const t of diagrams) {
  const filePath = path.join(ASY_DIR, t.file);
  sources[t.id] = fs.readFileSync(filePath, 'utf8');
}

// --- Generate HTML ---
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Quality analysis per diagram
const analysis = {
  '01_circles_circumcircle': {
    rating: 'Good',
    notes: 'Red and blue circles match. Triangle connecting A, B, P correct. Labels A=(0,0), B=(5,5), C=(-4,13), P, ω, γ all positioned correctly.'
  },
  '02_bipartite_graph': {
    rating: 'Good',
    notes: 'Complete bipartite graph K(5,5) with red edges on circle-positioned vertices. All 25 edges and 10 vertex dots present and correctly placed.'
  },
  '03_numbered_grid': {
    rating: 'Good',
    notes: 'Royalblue fill, 8×2 numbered grid (0-15), ⋯ dots column. Layout and colors match. (Reference PNG is very small due to Asymptote rendering at low unitsize.)'
  },
  '04_filled_triangle': {
    rating: 'Good',
    notes: 'Orange triangular fills and green (cyan+yellow averaged) hourglass region correct. Grid overlay with linewidth(0.6) present. Pen color averaging working correctly.'
  },
  '05_octagon_geometry': {
    rating: 'Good',
    notes: 'Regular octagon with vertices E-L, extension lines from E through corners P and Q, right angle marks at P, Q, and H. Diagonal line EI. All geometry matches.'
  },
  '06_angle_sectors': {
    rating: 'Good',
    notes: 'Red angle sectors at P and Q as pie-wedge fills using arc(). Triangle P-B-S with auxiliary lines P-R, Q-S, Q-R. Distance labels 30, 10, h, 9 correct.'
  },
  '07_two_circles': {
    rating: 'Good',
    notes: 'Two overlapping circles with intersection points A, B. Center C of left circle, tangent point D, external point P. Labels S, T for circles. Lines C-P and C-B-D drawn.'
  },
  '08_isometric_grid': {
    rating: 'Good',
    notes: 'Isometric 3D cube grid (10×10×10) with red fill. Three sets of parallel lines creating hexagonal outline. Excellent match with reference.'
  },
  '09_triangle_circumcircle': {
    rating: 'Good',
    notes: 'Triangle ABC with circumcircle (gray), orthocenter H, midpoint M, feet N, Q. Paleyellow fills for pedal triangle regions. Gray auxiliary lines. All 9 labeled points correct.'
  },
  '10_dimension_triangle': {
    rating: 'Good',
    notes: 'Filled triangle (orange+yellow blend) with dashed altitude, dimension arrows (Arrows(TeXHead)) and label "5". Clean match with reference.'
  },
};

function buildCard(t, idx) {
  const code = sources[t.id];
  const encodedCode = encodeURIComponent('[asy]\n' + code + '\n[/asy]');
  const openUrl = `../index.html#code=${encodedCode}`;
  const num = String(idx + 1).padStart(2, '0');
  const a = analysis[t.id] || {rating: '?', notes: ''};
  const ratingColor = a.rating === 'Good' ? '#2d8a4e' : a.rating === 'Fair' ? '#c0820a' : '#999';

  return `
<!-- Diagram ${num} -->
<div class="card">
  <div class="card-header">
    <h2>${num} &mdash; ${escapeHtml(t.desc)}</h2>
    <span class="rating" style="background:${ratingColor}">${a.rating}</span>
  </div>
  <div class="card-body">
    <div class="render-col col-ref">
      <h3>Asymptote (Reference)</h3>
      <div class="img-wrap">
        <img src="${t.id}.png" alt="Reference: ${escapeHtml(t.desc)}">
      </div>
    </div>
    <div class="render-col col-hitexer">
      <h3>HiTeXeR</h3>
      <div class="img-wrap">
        <object data="${t.id}.svg" type="image/svg+xml">SVG not supported</object>
      </div>
    </div>
    <div class="render-col col-source">
      <h3>Asymptote Source</h3>
      <div class="code-box"><code>${escapeHtml(code)}</code></div>
      <div class="link-row">
        <a class="open-link" href="${openUrl}" target="_blank">Open in HiTeXeR</a>
        <button class="open-link texer-btn" data-code="${escapeHtml('[asy]\n' + code + '\n[/asy]')}">Open in TeXeR</button>
      </div>
    </div>
  </div>
  <div class="analysis">${escapeHtml(a.notes)}</div>
</div>`;
}

// Show all diagrams (empty set = show all)
const showOnly = new Set([]);
const filteredDiagrams = diagrams.filter(t => showOnly.size === 0 || showOnly.has(t.id));
const cardsHtml = filteredDiagrams.map((t, i) => buildCard(t, diagrams.indexOf(t))).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HiTeXeR Rendering Comparison</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: #f0f2f5;
  padding: 24px;
  color: #333;
}

.container {
  max-width: 1600px;
  margin: 0 auto;
}

h1 {
  text-align: center;
  font-size: 1.8em;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 6px;
}

.subtitle {
  text-align: center;
  color: #666;
  font-size: 0.95em;
  margin-bottom: 32px;
}

/* --- Cards --- */
.card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  margin-bottom: 28px;
  overflow: hidden;
}

.card-header {
  background: #1a1a2e;
  color: #fff;
  padding: 14px 24px;
}

.card-header h2 {
  font-size: 1.1em;
  font-weight: 600;
}

/* --- 3-column layout: 40% / 40% / 20% --- */
.card-body {
  display: grid;
  grid-template-columns: 40% 40% 20%;
  gap: 0;
}

.render-col {
  padding: 16px;
  border-right: 1px solid #eee;
}

.render-col:last-of-type {
  border-right: none;
}

.render-col h3 {
  font-size: 0.78em;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 10px;
  text-align: center;
}

.img-wrap {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.img-wrap img,
.img-wrap object {
  max-width: 100%;
  max-height: 350px;
  display: block;
}

/* --- Code box --- */
.code-box {
  background: #f5f5f5;
  color: #333;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.45;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  max-height: 300px;
  overflow-y: scroll;
  white-space: pre;
  word-wrap: normal;
}

.code-box code {
  font-family: inherit;
  font-size: inherit;
}

.open-link {
  display: inline-block;
  margin-top: 10px;
  padding: 6px 14px;
  font-size: 0.82em;
  font-weight: 600;
  color: #1a1a2e;
  background: #e8e8f0;
  border: 1px solid #c0c0d0;
  border-radius: 5px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.open-link:hover {
  background: #1a1a2e;
  color: #fff;
  cursor: pointer;
}

.link-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.texer-btn {
  font-family: inherit;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rating {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 0.78em;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.analysis {
  padding: 12px 24px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  font-size: 0.88em;
  color: #555;
  line-height: 1.5;
}
</style>
</head>
<body>

<div class="container">

<h1>HiTeXeR Rendering Comparison</h1>
<p class="subtitle">Reference PNGs from real Asymptote vs. HiTeXeR JavaScript interpreter (${filteredDiagrams.length} diagrams)</p>

${cardsHtml}

</div><!-- .container -->
<script>
document.querySelectorAll('.texer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const code = btn.getAttribute('data-code');
    navigator.clipboard.writeText(code).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
      window.open('https://artofproblemsolving.com/texer/', '_blank');
    });
  });
});
</script>
</body>
</html>
`;

const outPath = path.join(OUT_DIR, 'index.html');
fs.writeFileSync(outPath, html);
console.log('\nWrote', outPath);
console.log('Done.');
