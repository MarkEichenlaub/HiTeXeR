// node refactor/parity2.js id,id,... — renders each id fresh in node AND in the
// browser page (current working tree) and reports whether the SVGs match.
const puppeteer=require('puppeteer'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');global.window={};global.katex=require('katex');const cl=console.log;console.log=console.warn=()=>{};
require(path.join(ROOT,'asy-interp.js'));
const ids=process.argv[2].split(',');
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.goto(process.env.HTX_VIEW_URL||'http://127.0.0.1:7842/index.html',{waitUntil:'load'});await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:60000});
let same=0;for(const id of ids){const src=fs.readFileSync(path.join(ROOT,'comparison/asy_src',id+'.asy'),'utf8');if(/\[\/asy\]/i.test(src))continue;
 const node=window.AsyInterp.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600}).svg;
 const page=await p.evaluate(s=>{try{return AsyInterp.render('[asy]\n'+s+'\n[/asy]',{containerW:800,containerH:600}).svg}catch(e){return 'ERR '+e.message}},src);
 if(node===page)same++;else{const w=s=>(s.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/)||[]).slice(1).join('x');cl('DIFF',id,'node',w(node),'page',w(page))}}
cl('identical',same,'of',ids.length);await b.close().catch(()=>{});process.exit(0)})();
