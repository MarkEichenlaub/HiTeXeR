const fs = require('fs');
const re = /(?:label|dot|Label)\s*\(\s*("(?:[^"\\]|\\.)*")/g;
for (const id of process.argv.slice(2)) {
  let t;
  try { t = fs.readFileSync('comparison/asy_src/' + id + '.asy', 'utf8'); }
  catch (e) { console.log(id, 'NO-SRC'); continue; }
  const labels = [...t.matchAll(re)].map(m => m[1]);
  let mathChars = 0, textChars = 0;
  for (const l of labels) {
    const inner = l.slice(1, -1);
    let inM = false;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '$') { inM = !inM; continue; }
      if (/\s/.test(c)) continue;
      if (inM) mathChars++; else textChars++;
    }
  }
  const tot = mathChars + textChars;
  const frac = tot > 0 ? (mathChars / tot).toFixed(2) : 'na';
  console.log(id, 'nLabels=' + labels.length, 'mathFrac=' + frac,
    ':: ' + labels.slice(0, 6).join(' | ').slice(0, 160));
}
