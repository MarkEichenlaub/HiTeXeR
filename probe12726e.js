const fs = require('fs');
const svg = fs.readFileSync('test12726.svg', 'utf8');
const re = /<path d="([^"]+)" fill="none" stroke="#000000"[^>]*stroke-width="([^"]+)"[^>]*\/>/g;
let m;
const byWidth = {};
while ((m = re.exec(svg)) !== null) {
  const cmds = (m[1].match(/[MLC]/g) || []).length;
  const w = m[2];
  if (!byWidth[w]) byWidth[w] = {short: 0, medium: 0, long: 0};
  if (cmds < 5) byWidth[w].short++;
  else if (cmds < 30) byWidth[w].medium++;
  else byWidth[w].long++;
}
console.log(byWidth);
