'use strict';
const fs = require('fs');
const path = require('path');
global.window = {};
require('./asy-interp.js');
const A = window.AsyInterp;

const files = [
  { id: '01_graph_tangent', file: 'c10_L1_script_0.asy', desc: 'Graph package: cubic function with tangent line, axes with ticks' },
  { id: '02_graph_area', file: 'c10_L10_script_11.asy', desc: 'Graph package: area under curve with buildcycle fill, dashed boundaries' },
  { id: '03_picture_composite', file: 'c321_L12_script_11.asy', desc: 'Picture compositing: two graphs side-by-side with grid, fill regions, shift' },
  { id: '04_3d_wireframe', file: 'c57_L17_script_0.asy', desc: '3D wireframe: prism with right angle marks, dashed hidden edges, labels' },
  { id: '05_3d_circle', file: 'c462_L11_script_85.asy', desc: '3D: axes with arrows, circle in 3D, labeled points' },
  { id: '06_unit_circle', file: 'c10_L1_script_19.asy', desc: 'Unit circle with spiral arc, angle labels, right angle mark, bezier curves' },
  { id: '07_petersen_graph', file: 'c53_L13_script_14.asy', desc: 'Petersen graph: colored filled circles at vertices, complex connectivity' },
  { id: '08_zigzag_resistor', file: 'c10_L123_script_3.asy', desc: 'Zigzag pattern with filldraw, loops, shift transforms' },
  { id: '09_geometry_incircle', file: 'c4_L12_script_13.asy', desc: 'Geometry: triangle with incircle, foot perpendiculars, median, labels' },
  { id: '10_spiral_grid', file: 'c583_L10_p50523_problem_text_1.asy', desc: 'Algorithmic: spiral-numbered grid with gray padding border, nested loops' },
];

const outDir = path.join(__dirname, 'comparison');

for (const t of files) {
  const raw = fs.readFileSync(path.join('asy_corpus', t.file), 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  try {
    const r = A.render(code, { containerW: 500, containerH: 400 });
    fs.writeFileSync(path.join(outDir, t.id + '.svg'), r.svg);
    console.log('OK:', t.id, '- SVG', r.svg.length, 'bytes');
  } catch (e) {
    console.log('FAIL:', t.id, '-', e.message.split('\n')[0].substring(0, 120));
    fs.writeFileSync(path.join(outDir, t.id + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="10" y="30" fill="red">RENDER ERROR: ${e.message.substring(0,80)}</text></svg>`);
  }
}

// Write metadata
fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(files, null, 2));
console.log('Done. SVGs written to comparison/');
