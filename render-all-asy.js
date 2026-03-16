'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASY = '"C:\\Program Files\\Asymptote\\asy.exe"';
const CORPUS = 'asy_corpus';
const OUTDIR = 'comparison';

const files = [
  { id: '01_graph_tangent', file: 'c10_L1_script_0.asy', extraImport: '' },
  { id: '02_graph_area', file: 'c10_L10_script_11.asy', extraImport: '' },
  { id: '03_picture_composite', file: 'c321_L12_script_11.asy', extraImport: 'import graph;\n' },
  { id: '04_3d_wireframe', file: 'c57_L17_script_0.asy', extraImport: 'import three;\nsettings.render=0;\nsettings.prc=false;\n' },
  { id: '05_3d_circle', file: 'c462_L11_script_85.asy', extraImport: 'settings.render=0;\nsettings.prc=false;\n' },
  { id: '06_unit_circle', file: 'c10_L1_script_19.asy', extraImport: 'import olympiad;\n' },
  { id: '07_petersen_graph', file: 'c53_L13_script_14.asy', extraImport: 'import olympiad;\n' },
  { id: '08_zigzag_resistor', file: 'c10_L123_script_3.asy', extraImport: '' },
  { id: '09_geometry_incircle', file: 'c4_L12_script_13.asy', extraImport: '' },
  { id: '10_spiral_grid', file: 'c583_L10_p50523_problem_text_1.asy', extraImport: '' },
];

for (const t of files) {
  const outPng = path.join(OUTDIR, t.id + '.png');

  let src = fs.readFileSync(path.join(CORPUS, t.file), 'utf8');

  // Some corpus files need implicit imports
  if (t.extraImport) {
    src = t.extraImport + src;
  }

  // Handle 'origin' - standard Asymptote variable
  if (src.includes('origin') && !src.includes('pair origin')) {
    src = 'pair origin = (0,0);\n' + src;
  }
  if (src.includes('markscalefactor') && !src.includes('real markscalefactor')) {
    src = 'real markscalefactor = 0.03;\n' + src;
  }

  const tmpFile = path.join(OUTDIR, '_tmp_' + t.id + '.asy');
  fs.writeFileSync(tmpFile, src);

  try {
    // Render to EPS first, then convert to PNG at 240 DPI (matching AoPS TeXeR)
    const outEps = path.join(OUTDIR, t.id + '.eps');
    execSync(`${ASY} -noView -nobatchView -nointeractiveView -f eps -o "${outEps}" "${tmpFile}" 2>&1`, { timeout: 60000 });
    execSync(`magick -density 240 "${outEps}" -flatten "${outPng}" 2>&1`, { timeout: 60000 });
    try { fs.unlinkSync(outEps); } catch(e) {}
    console.log('OK:', t.id);
  } catch (e) {
    const errMsg = e.stdout ? e.stdout.toString().substring(0, 300) : e.message.substring(0, 300);
    console.log('FAIL:', t.id, '-', errMsg.split('\n').slice(0, 3).join(' | '));
  }

  try { fs.unlinkSync(tmpFile); } catch(e) {}
}

console.log('Done.');
