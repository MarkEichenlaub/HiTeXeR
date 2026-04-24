const fs=require('fs');
const r=JSON.parse(fs.readFileSync('comparison/ssim-results.json','utf8'));
const byId={};
for(const e of r) byId[e.id]=e;
const ids=['03892','03887','03567','12725','00050','00118','00115','01937','00001','12533','05122','07399','12274','09343','07710','00002','03384','03385','03386','03568','03593','03888'];
for(const id of ids){
  const e=byId[id];
  if(!e) {console.log(id,'NOT FOUND');continue;}
  console.log(id, 'ssim=', (e.ssim||0).toFixed(3), 'combined=', (e.combined||0).toFixed(3), 'wR=', (e.wRatio||0).toFixed(2), 'hR=', (e.hRatio||0).toFixed(2));
}
