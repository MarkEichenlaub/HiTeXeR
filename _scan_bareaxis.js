const fs=require('fs'), path=require('path');
const SRC='./comparison/asy_src';
const r = require('./comparison/ssim-results.json');
const byId = {}; for (const v of Object.values(r)) if (v && /^[0-9]{5}$/.test(v.id)) byId[v.id]=v;
const files = fs.readdirSync(SRC).filter(f=>/^[0-9]{5}\.asy$/.test(f));
let hits=[];
for (const f of files) {
  const s = fs.readFileSync(path.join(SRC,f),'utf8');
  const bareAxis = /\b[xy]axis\s*\(\s*("[^"]*"|Label\([^)]*\))?\s*(,\s*(Arrow|Arrows|EndArrow)\s*(\([^)]*\))?)?\s*\)/.test(s);
  const userMinMax = /\b(int|real)\s+xmin\s*=/.test(s);
  const axisUsesMin = /[xy]axis\s*\([^)]*(xmin|xmax|ymin|ymax)/.test(s);
  if (bareAxis && userMinMax && !axisUsesMin) hits.push(f.slice(0,5));
}
console.log('bare-axis + unused xmin/xmax globals:', hits.length);
const scored = hits.map(id=>byId[id]).filter(Boolean);
scored.sort((a,b)=>a.ssim-b.ssim);
scored.slice(0,25).forEach(v=>console.log(' ', v.id, v.ssim.toFixed(3), 'sz'+(v.sizeScore<0.9?'!':' '), v.corpusFile.slice(0,55)));
console.log('mean ssim:', (scored.reduce((s,v)=>s+v.ssim,0)/scored.length).toFixed(3), 'n<0.95:', scored.filter(v=>v.ssim<0.95).length);
