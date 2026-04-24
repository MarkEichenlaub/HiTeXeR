const fs = require('fs');
// Updates from this session only (IDs whose SSIM changed by more than 0.005)
const updates = {
  '02868': 0.9748737385235366,
  '08898': 0.9358143386461056,
  '04087': 0.5914791621619592,
  '00421': 0.9247283132324785,
  '12386': 0.6801850153546908,
  '12909': 0.877737024644959,
  '08559': 0.960430049485357,
  '12108': 0.8236958370899822,
  '12852': 0.660052551802708,
};

const ssimPath = 'comparison/ssim-results.json';
const raw = JSON.parse(fs.readFileSync(ssimPath, 'utf8'));
const isArr = Array.isArray(raw);
let changed = 0;
if (isArr) {
  for (const row of raw) {
    if (updates[row.id] != null) {
      row.ssim = updates[row.id];
      changed++;
    }
  }
} else {
  for (const id of Object.keys(updates)) {
    if (raw[id]) { raw[id].ssim = updates[id]; changed++; }
  }
}
fs.writeFileSync(ssimPath, JSON.stringify(raw, null, 2));
console.log('Changed', changed, 'rows in', ssimPath);
