const fs = require('fs');
const m = require('child_process');
// inline the repair fn by requiring via a tiny eval of the file's repair
const src = fs.readFileSync('comparison/repair-tab-corruption.js', 'utf8');
const fnText = src.slice(src.indexOf('function repair('), src.indexOf('let totalFiles'));
eval(fnText);
for (const id of ['05932', '06169']) {
  const t = fs.readFileSync(`comparison/asy_src/${id}.asy`, 'utf8');
  const { out } = repair(t);
  console.log(`=== ${id} ===`);
  for (const ln of out.split('\n')) {
    if (ln.includes('\\nu') || ln.includes('\\ne') || ln.includes('label("$')) console.log('  ' + JSON.stringify(ln.slice(0, 70)));
  }
}
