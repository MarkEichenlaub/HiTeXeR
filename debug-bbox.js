const fs = require('fs');

// Set up globals for asy-interp
global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;

// Read the ASY file
const asyCode = fs.readFileSync('comparison/asy_src/04024.asy', 'utf8');
const code = '[asy]\n' + asyCode + '\n[/asy]';

// Parse and evaluate with debug output
const result = A.render(code, { containerW: 500, containerH: 400 });

// Extract values from the SVG
const svgMatch = result.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const widthMatch = result.svg.match(/width="([\d.]+)"/);
const heightMatch = result.svg.match(/height="([\d.]+)"/);

if (svgMatch && widthMatch && heightMatch) {
  const viewW = parseFloat(svgMatch[1]);
  const viewH = parseFloat(svgMatch[2]);
  const svgW = parseFloat(widthMatch[1]);
  const svgH = parseFloat(heightMatch[1]);

  console.log('SVG dimensions:');
  console.log(`  width="${svgW}" height="${svgH}"`);
  console.log(`  viewBox="0 0 ${viewW} ${viewH}"`);
  console.log(`  Aspect ratio (w/h): ${svgW / svgH}`);
  console.log(`  Scale: ${svgW / viewW}`);
}

// Also access internal data
const interp = A._createInterpreter();
const execResult = interp.execute(asyCode);
console.log('\nDraw commands:');
execResult.pics.forEach((pic, i) => {
  console.log(`Picture ${i}: ${pic.commands.length} commands`);
  pic.commands.forEach((cmd) => {
    if (cmd.cmd === 'dot') {
      console.log(`  dot at (${cmd.pos.x}, ${cmd.pos.y})`);
    } else if (cmd.cmd === 'label') {
      console.log(`  label "${cmd.text}" at (${cmd.pos.x}, ${cmd.pos.y})`);
    } else if (cmd.cmd === 'draw' && cmd.path && cmd.path._isCircle) {
      console.log(`  circle at center (${cmd.path._center.x}, ${cmd.path._center.y}) radius ${cmd.path._radius}`);
    }
  });
});