// node refactor/pagesvg.js <id> [page] — writes the in-browser render to _page_<id>.svg
const puppeteer=require('puppeteer'),fs=require('fs');const id=process.argv[2];
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.goto('http://127.0.0.1:7842/'+(process.argv[3]||'index.html'),{waitUntil:'load'});await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:60000});
const src=fs.readFileSync('comparison/asy_src/'+id+'.asy','utf8');
fs.writeFileSync('_page_'+id+'.svg',await p.evaluate(s=>AsyInterp.render('[asy]\n'+s+'\n[/asy]',{containerW:800,containerH:600}).svg,src));
await b.close().catch(()=>{});process.exit(0)})();
