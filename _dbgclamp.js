const fs=require('fs');global.window=global.window||{};global.katex=require('katex');require('./asy-interp.js');
const A=global.window.AsyInterp;
for(const id of process.argv.slice(2)){
  const raw=fs.readFileSync('comparison/asy_src/'+id+'.asy','utf8');
  process.stderr.write('=== '+id+' ===\n');
  try{A.render('[asy]\n'+raw+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});}catch(e){process.stderr.write('ERR '+e.message+'\n');}
}
