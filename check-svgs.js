'use strict';
const fs = require('fs');
const path = require('path');
const dir = 'comparison/asy_src';
const eps_re = /\/var\/www\/cdn\/[^\s"'\\)]+/g;
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.asy'));
const ids = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(dir,f),'utf8');
  if ((raw.match(eps_re) || []).length) ids.push(f.replace('.asy',''));
}
let placeholdersInSvg = 0, hasImageInSvg = 0, missingSvg = 0;
const placeholderIDs = [], missingIDs = [];
for (const id of ids) {
  const p = 'comparison/htx_svgs/' + id + '.svg';
  if (!fs.existsSync(p)) { missingSvg++; missingIDs.push(id); continue; }
  const s = fs.readFileSync(p, 'utf8');
  const isPlaceholder = s.includes('#e0e0e0') && s.includes('stroke="#999"');
  const hasImage = s.includes('<image ') || s.includes('htx-img');
  if (isPlaceholder) { placeholdersInSvg++; placeholderIDs.push(id); }
  if (hasImage) hasImageInSvg++;
}
console.log('Total IDs with EPS:', ids.length);
console.log('Has image element in SVG:', hasImageInSvg);
console.log('Has placeholder gray box in SVG:', placeholdersInSvg);
console.log('Missing SVG:', missingSvg);
if (placeholderIDs.length) console.log('Placeholder IDs:', placeholderIDs.join(' '));
if (missingIDs.length) console.log('Missing SVG IDs:', missingIDs.join(' '));
