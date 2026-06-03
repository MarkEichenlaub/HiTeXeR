const fs=require('fs'), path=require('path');
const ROOT=process.cwd();
global.window = global.window || {};
global.document = global.document || { createElement:()=>({getContext:()=>({}),style:{}}), createElementNS:()=>({style:{},setAttribute:()=>{}}) };
require(path.join(ROOT,'asy-interp.js'));
const A=global.window.AsyInterp;
const id=process.argv[2]||'12923';
const raw=fs.readFileSync(path.join(ROOT,'comparison/asy_src',id+'.asy'),'utf8');
const code='[asy]\n'+raw+'\n[/asy]';
try {
  const r=A.render(code,{containerW:800,containerH:600,labelOutput:'svg-native'});
  const vb=(r.svg.match(/viewBox="([^"]+)"/)||[])[1];
  console.log('OK viewBox=',vb,'len=',r.svg.length);
} catch(e){ console.log('ERR',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n')); }
