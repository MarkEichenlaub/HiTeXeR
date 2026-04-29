const fs = require('fs');
const svg = fs.readFileSync('test12726.svg', 'utf8');
// Look at first 100 path elements - their order matters for z-stacking
const re = /<path[^>]+>/g;
let m, i = 0;
const lastFew = [];
while ((m = re.exec(svg)) !== null) {
  i++;
  // categorize
  const isFill = /fill="(?!none)[^"]+"/.test(m[0]) && !/stroke="#000000"/.test(m[0]);
  const strokeBlack = /stroke="#000000"/.test(m[0]);
  const strokeWidth = (m[0].match(/stroke-width="([^"]+)"/) || [,'?'])[1];
  if (i <= 5 || (i > 39990 && i < 40050) || (i > 40220 && i < 40270)) {
    console.log(`#${i}: fill=${isFill?'Y':'N'} blackStroke=${strokeBlack?'Y':'N'} sw=${strokeWidth}`);
  }
}
console.log('total paths:', i);
