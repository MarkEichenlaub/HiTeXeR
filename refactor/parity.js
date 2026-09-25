// Does the browser (comparator/editor) render the same SVG as node (SSIM pipeline)?
// node refactor/parity.js [N] — compares comparison/htx_svgs/<id>.svg with an
// in-page AsyInterp.render of the same source, for N random corpus ids.
const puppeteer=require('puppeteer'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const all=fs.readdirSync(path.join(ROOT,'comparison/htx_svgs')).map(f=>f.slice(0,-4));
const N=+(process.argv[2]||60);const ids=(process.argv[3]?process.argv[3].split(','):all.sort(()=>Math.random()-0.5).slice(0,N));
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.goto('http://127.0.0.1:7842/'+(process.env.PAGE||'index.html')+'',{waitUntil:'load'});await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:60000});
let same=0,diff=[];
for(const id of ids){const src=fs.readFileSync(path.join(ROOT,'comparison/asy_src',id+'.asy'),'utf8');const node=fs.readFileSync(path.join(ROOT,'comparison/htx_svgs',id+'.svg'),'utf8');
 const page=await p.evaluate((src)=>{try{const isDoc=/\[\/asy\]/i.test(src);if(isDoc)return null;return AsyInterp.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600}).svg}catch(e){return 'ERR '+e.message}},src);
 if(page===null)continue; if(page===node)same++;else{let i=0;while(page[i]===node[i])i++;diff.push({id,at:i,node:node.slice(i-60,i+60),page:page.slice(i-60,i+60)})}}
console.log('identical',same,'different',diff.length);for(const d of diff.slice(0,6))console.log(d.id,'\n node:',d.node,'\n page:',d.page);
await b.close().catch(()=>{});process.exit(0)})();
