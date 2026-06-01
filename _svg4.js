const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
// account for viewBox scaling: SVG coords may differ from PNG px. Find width/height & viewBox.
const vb=svg.match(/viewBox="([^"]+)"/);const wm=svg.match(/<svg[^>]*\bwidth="([\d.]+)/);const hm=svg.match(/height="([\d.]+)/);
console.log('viewBox',vb&&vb[1],'width',wm&&wm[1],'height',hm&&hm[1]);
