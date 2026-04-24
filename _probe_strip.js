const fs = require('fs');
const src = fs.readFileSync('asy-interp.js', 'utf8');
const lines = src.split('\n');
// lines 14008 through 14103 in 1-indexed (0-indexed: 14007-14102)
const fn = lines.slice(14007, 14103).join('\n');
fs.writeFileSync('_tmp_strip.js', fn + '\nmodule.exports = stripLaTeX;\n');
const stripLaTeX = require('./_tmp_strip.js');
const labels = [
  "$ \\definecolor{Fcolor}{RGB}{20,20,255}{\\color{Fcolor} F} \\definecolor{equalcolor}{RGB}{0,0,0}{\\color{equalcolor} =} \\definecolor{minuscolor}{RGB}{0,0,0}{\\color{minuscolor} -} \\definecolor{kcolor}{RGB}{114,0,172}{\\color{kcolor}k} \\definecolor{deltacolor}{RGB}{0,0,0}{\\color{deltacolor} \\Delta} \\definecolor{xcolor}{RGB}{0,0,0}{\\color{xcolor} x}$",
  "$\\definecolor{kcolor}{RGB}{114,0,172}{\\color{kcolor} \\rm spring \\, constant}$",
  "$\\definecolor{Fcolor}{RGB}{20,20,255}{\\color{Fcolor} \\rm spring \\, force}$"
];
for (const l of labels) {
  const s = stripLaTeX(l);
  console.log(JSON.stringify(s), 'len=', s.length);
}
