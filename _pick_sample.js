const fs = require('fs');
const results = JSON.parse(fs.readFileSync('comparison/ssim-results.json', 'utf8'));
const canary = JSON.parse(fs.readFileSync('auto-fix/canary.json', 'utf8'));
const canarySet = new Set(Object.keys(canary));
// deterministic pseudo-random pick (no Math.random): hash id, sort, take N
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const ids = results
  .map(r => r.id)
  .filter(id => id && !canarySet.has(id) && fs.existsSync('comparison/asy_src/' + id + '.asy') && fs.existsSync('comparison/texer_pngs/' + id + '.png'));
ids.sort((a, b) => hash(a) - hash(b));
const N = parseInt(process.argv[2] || '250', 10);
console.log(ids.slice(0, N).join(','));
