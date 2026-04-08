'use strict';
const fs = require('fs');
const path = require('path');

// Load aops-nodes.json from eigennode project
const NODES_FILE = path.join('C:', 'Users', 'Mark Eichenlaub', 'github', 'eigennode', 'scripts', 'aops-nodes.json');
const CORPUS_DIR = path.join(__dirname, '..', 'asy_corpus');

const data = JSON.parse(fs.readFileSync(NODES_FILE, 'utf-8'));
const nodes = data.nodes;

// Find all #asymptote nodes and extract their code
const asyNodes = [];
for (const [id, node] of Object.entries(nodes)) {
  if (node.content && node.content.includes('#asymptote') && node.note) {
    let code = node.note.trim();
    // Strip [asy]...[/asy] wrappers
    code = code.replace(/^\[asy\]\s*/i, '').replace(/\s*\[\/asy\]\s*$/i, '').trim();
    if (code.length > 0) {
      asyNodes.push({ id, code });
    }
  }
}

console.log(`Found ${asyNodes.length} asymptote diagrams in physics courses`);

// Write them as c405_L1_physics_{idx}.asy (all from collection 405)
let written = 0;
for (let i = 0; i < asyNodes.length; i++) {
  const filename = `c405_L1_physics_${i}.asy`;
  const filepath = path.join(CORPUS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, asyNodes[i].code);
    console.log(`  Wrote ${filename} (${asyNodes[i].code.length} chars)`);
    written++;
  } else {
    console.log(`  Skipped ${filename} (already exists)`);
  }
}

console.log(`\nWrote ${written} new .asy files to ${CORPUS_DIR}`);
