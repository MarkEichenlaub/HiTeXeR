'use strict';
// Generates comparison/fix-history.html as a fully static file with data embedded inline.
// Called from fix-server.js (after enqueue) and run-loop.js (after each iteration).
// No server is needed to view the generated page.
//
// Data model:
//   Primary source : attempts.jsonl  (all diagram attempts regardless of queue method)
//   Enrichment     : enqueue-history.jsonl (descriptions + before-snapshots)
//   After-snapshot : fix-snapshots/{commitHash}-after.png  (saved on commit by run-loop)
//   Pending queue  : queue.json items that have no matching attempt yet
//   4 image cols   : texer | before | after | current

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const ENQUEUE_HISTORY   = path.join(__dirname, 'enqueue-history.jsonl');
const ATTEMPTS          = path.join(__dirname, 'attempts.jsonl');
const QUEUE_PATH        = path.join(__dirname, 'queue.json');
const STATUS_FILE       = path.join(__dirname, '.status.json');
const FIX_SNAPSHOTS_DIR = path.join(__dirname, 'fix-snapshots');
const OUTPUT            = path.join(ROOT, 'comparison', 'fix-history.html');

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function padId(id) { return String(id).padStart(5, '0'); }

function generate() {
  const allAttempts = readJsonl(ATTEMPTS);
  const enqueues    = readJsonl(ENQUEUE_HISTORY);

  let currentQueue = [];
  try { currentQueue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); } catch {}
  const queueItems = Array.isArray(currentQueue) ? currentQueue : [];

  // Current processing state from run-loop's .status.json
  let statusJson = null;
  try { statusJson = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch {}
  const processingId = statusJson && statusJson.currentId ? padId(statusJson.currentId) : null;

  // Find best matching enqueue entry for a given id+timestamp:
  // the most recent enqueue for that id at or before the attempt ts.
  function findEnqueue(attemptId, attemptTs) {
    const candidates = enqueues.filter(e =>
      padId(e.id) === padId(attemptId) && e.enqueuedAt <= attemptTs
    );
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  // Build items from attempts (primary source).
  const items = allAttempts.map(attempt => {
    const id = padId(attempt.id);
    const eq = findEnqueue(id, attempt.ts);
    const enqueueId = eq ? eq.enqueueId : null;
    const beforeFile = enqueueId ? path.join(FIX_SNAPSHOTS_DIR, enqueueId + '-before.png') : null;
    const commitHash = attempt.commit || null;
    const afterFile  = commitHash ? path.join(FIX_SNAPSHOTS_DIR, commitHash + '-after.png') : null;
    return {
      id,
      ts:                attempt.ts,
      attempt,
      enqueueId,
      description:       eq ? (eq.description || '') : '',
      hasBeforeSnapshot: beforeFile ? fs.existsSync(beforeFile) : false,
      hasAfterSnapshot:  afterFile  ? fs.existsSync(afterFile)  : false,
      commitHash,
      queued:            false,
      isProcessing:      id === processingId,
    };
  }).reverse(); // newest first

  // Append pending queue items that have no attempt yet.
  for (const qi of queueItems) {
    const id = padId(qi.id);
    const hasAttempt = allAttempts.some(a => padId(a.id) === id && a.ts >= qi.addedAt);
    if (!hasAttempt) {
      const eq = enqueues.filter(e => padId(e.id) === id).pop();
      const enqueueId = eq ? eq.enqueueId : null;
      const beforeFile = enqueueId ? path.join(FIX_SNAPSHOTS_DIR, enqueueId + '-before.png') : null;
      items.unshift({
        id,
        ts:                qi.addedAt,
        attempt:           null,
        enqueueId,
        description:       qi.description || (eq ? eq.description || '' : ''),
        hasBeforeSnapshot: beforeFile ? fs.existsSync(beforeFile) : false,
        hasAfterSnapshot:  false,
        commitHash:        null,
        queued:            true,
        isProcessing:      id === processingId,
      });
    }
  }

  fs.writeFileSync(OUTPUT, buildHtml(items, new Date().toISOString()));
  console.log('[generate-fix-history] wrote ' + items.length + ' items -> ' + OUTPUT);
}

function buildHtml(items, generatedAt) {
  const dataJson = JSON.stringify(items).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fix History - HiTeXeR</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f0f1a;color:#e2e8f0;font-family:'Cascadia Code',Consolas,monospace;font-size:12px}
a{color:inherit;text-decoration:none}

#hdr{display:flex;align-items:center;gap:10px;padding:7px 14px;background:#1a1a2e;border-bottom:1px solid #2d2d4a;position:sticky;top:0;z-index:20}
#hdr h1{font-size:14px;font-weight:600;color:#c4b5fd;flex:1}
#hdr a{font-size:11px;color:#64748b}
#hdr a:hover{color:#e2e8f0}
#gen-ts{font-size:10px;color:#94a3b8}

#tabs{display:flex;gap:0;padding:6px 14px 0;background:#13131f;border-bottom:1px solid #2d2d4a;align-items:flex-end}
.tab{padding:5px 12px;cursor:pointer;font-size:11px;color:#64748b;border-bottom:2px solid transparent;transition:color .1s}
.tab:hover{color:#a0aec0}
.tab.active{color:#c4b5fd;border-bottom-color:#7c3aed}
#sort-btn{margin-left:auto;background:none;border:1px solid #2d2d4a;color:#94a3b8;padding:2px 8px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;margin-bottom:4px;white-space:nowrap}
#sort-btn:hover{border-color:#64748b;color:#e2e8f0}
#count-note{font-size:10px;color:#94a3b8;align-self:center;padding:0 8px 4px;white-space:nowrap}

#list-wrap{padding:6px 10px;display:flex;flex-direction:column;gap:2px}
#empty-msg{padding:40px;text-align:center;color:#3d3d5a}

.row{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px;cursor:pointer;border:1px solid #1e1e32;background:#15152a;min-height:50px;transition:background .1s}
.row:hover{background:#1d1d35;border-color:#2d2d4a}
.row.processing{border-color:#7c3aed;background:#1a1030}

.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-green  {background:#22c55e}
.dot-teal   {background:#06b6d4}
.dot-red    {background:#ef4444}
.dot-orange {background:#f97316}
.dot-blue   {background:#3b82f6}
.dot-purple {background:#a855f7;animation:pulse 1.2s ease-in-out infinite}
.dot-gray   {background:#475569}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

.row-id{font-weight:700;color:#a78bfa;width:44px;flex-shrink:0;font-size:12px}

.thumbs{display:flex;gap:3px;flex-shrink:0}
.thumb-mini{width:42px;height:42px;border:1px solid #2d2d4a;border-radius:2px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0}
.thumb-mini img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.thumb-mini.empty{background:#131320;border-style:dashed}
.thumb-mini .tlabel{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#94a3b8;font-size:8px;text-align:center;line-height:1.4}

.badge{padding:1px 5px;border-radius:2px;font-size:10px;font-weight:600;white-space:nowrap;flex-shrink:0}
.b-committed  {background:#14532d;color:#86efac}
.b-accepted   {background:#0c4a6e;color:#7dd3fc}
.b-canary     {background:#7f1d1d;color:#fca5a5}
.b-rejected   {background:#7c2d12;color:#fdba74}
.b-queued     {background:#1e3a5f;color:#93c5fd}
.b-processing {background:#3b0764;color:#e9d5ff}
.b-pending    {background:#2d2d0f;color:#fde68a}
.b-other      {background:#1e293b;color:#64748b}

.ssim-cell{width:110px;flex-shrink:0;white-space:nowrap;font-size:11px;color:#94a3b8}
.ssim-cell .up{color:#4ade80}
.ssim-cell .dn{color:#f87171}
.ssim-cell .arr{color:#6d28d9}

.desc{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#94a3b8;font-size:11px;min-width:0}
.desc.nodesc{color:#3d3d5a;font-style:italic}

.ts-cell{width:90px;flex-shrink:0;font-size:15px;color:#94a3b8;text-align:right;white-space:nowrap;margin-right:4px}

.fix-btn{flex-shrink:0;background:#1e5f3a;border:1px solid #22c55e;color:#86efac;padding:2px 6px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px}
.fix-btn:hover{background:#166534}

#pagination{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-top:1px solid #1e1e32}
.pg-btn{background:#1e1e32;border:1px solid #2d2d4a;color:#94a3b8;padding:3px 10px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px}
.pg-btn:hover:not(:disabled){background:#2d2d4a;color:#e2e8f0}
.pg-btn:disabled{opacity:.3;cursor:default}
#pg-info{font-size:11px;color:#94a3b8}

#modal{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:100;display:none;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
#modal.open{display:flex}
#modal-box{background:#1a1a2e;border:1px solid #4a4a6a;border-radius:8px;max-width:1400px;width:100%;padding:16px;display:flex;flex-direction:column;gap:12px}
#modal-hdr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#modal-title{font-size:13px;color:#c4b5fd;font-weight:600;flex:1}
#modal-close{background:#2d2d4a;border:1px solid #4a4a6a;color:#94a3b8;padding:3px 10px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px}
#modal-close:hover{color:#e2e8f0}
#modal-imgs{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.mcol{display:flex;flex-direction:column;align-items:center;gap:5px}
.mcol-lbl{font-size:10px;color:#64748b}
.mcol img{max-width:min(23vw,300px);max-height:68vh;object-fit:contain;background:#fff;border:1px solid #2d2d4a;border-radius:3px}
.mcol .mno{width:150px;height:110px;background:#131320;color:#3d3d5a;display:flex;align-items:center;justify-content:center;border-radius:3px;border:1px dashed #2d2d4a;font-size:11px;text-align:center;padding:4px}
#modal-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:11px}
#modal-meta .mfield{display:flex;gap:6px}
#modal-meta .mk{color:#64748b}
#modal-meta .mv{color:#e2e8f0}
#modal-notes{font-size:11px;color:#94a3b8;background:#0f0f1a;border-radius:3px;padding:8px;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow-y:auto;line-height:1.5}
#modal-fixbtn{background:#1e5f3a;border:1px solid #22c55e;color:#86efac;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;align-self:flex-start}
#modal-fixbtn:hover{background:#166534}
#modal-fixbtn:disabled{opacity:.4;cursor:default}
</style>
</head>
<body>

<div id="hdr">
  <a href="blink.html">back to Blink</a>
  <h1>Fix History</h1>
  <span id="gen-ts">Generated ${generatedAt.replace('T',' ').slice(0,19)} UTC</span>
</div>

<div id="tabs">
  <div class="tab active" data-f="all">All</div>
  <div class="tab" data-f="committed">Committed</div>
  <div class="tab" data-f="rejected">Rejected</div>
  <div class="tab" data-f="pending">In Queue / Pending</div>
  <button id="sort-btn" onclick="toggleSort()">newest first</button>
  <span id="count-note"></span>
</div>

<div id="list-wrap"><div id="empty-msg">Loading...</div></div>
<div id="pagination"></div>

<div id="modal">
  <div id="modal-box">
    <div id="modal-hdr">
      <span id="modal-title"></span>
      <button id="modal-close" onclick="closeModal()">close</button>
    </div>
    <div id="modal-imgs"></div>
    <div id="modal-meta"></div>
    <div id="modal-notes" style="display:none"></div>
    <button id="modal-fixbtn" onclick="modalFixAgain()">Fix Again</button>
  </div>
</div>

<script>
const DATA = ${dataJson};
const PAGE_SIZE = 50;
let currentFilter = 'all';
let currentPage   = 1;
let currentSort   = 'newest';  // 'newest' | 'oldest'
let _modalItem    = null;

function toggleSort(){
  currentSort = currentSort === 'newest' ? 'oldest' : 'newest';
  document.getElementById('sort-btn').textContent = currentSort + ' first';
  currentPage = 1;
  renderList();
}

function pad(id){ return String(id).padStart(5,'0'); }

function fmtTs(ts){
  if(!ts) return '';
  const d = new Date(ts), now = Date.now(), diff = now - d;
  if(diff < 3600000)  return Math.floor(diff/60000)+'m ago';
  if(diff < 86400000) return Math.floor(diff/3600000)+'h ago';
  if(diff < 604800000)return Math.floor(diff/86400000)+'d ago';
  return d.toLocaleDateString();
}

function statusInfo(item){
  if(item.isProcessing) return {label:'Processing',dotCls:'dot-purple',badgeCls:'b-processing',cat:'pending'};
  const a = item.attempt;
  if(!a){
    if(item.queued) return {label:'Queued',  dotCls:'dot-blue',badgeCls:'b-queued',  cat:'pending'};
    return              {label:'Pending', dotCls:'dot-blue',badgeCls:'b-pending', cat:'pending'};
  }
  switch(a.verdict){
    case 'fix':                  return {label:'Committed',   dotCls:'dot-green',  badgeCls:'b-committed',cat:'committed'};
    case 'ssim-artifact':        return {label:'Accepted',    dotCls:'dot-teal',   badgeCls:'b-accepted', cat:'committed'};
    case 'regressed-canary':     return {label:'Canary fail', dotCls:'dot-red',    badgeCls:'b-canary',   cat:'rejected'};
    case 'attempted-no-improve': return {label:'Rejected',    dotCls:'dot-orange', badgeCls:'b-rejected', cat:'rejected'};
    case 'unfixable-feature':    return {label:'Unfixable',   dotCls:'dot-gray',   badgeCls:'b-other',    cat:'rejected'};
    default:                     return {label:a.verdict||'?',dotCls:'dot-gray',   badgeCls:'b-other',    cat:'rejected'};
  }
}

function ssimHtml(item){
  const a = item.attempt;
  if(!a) return '<span style="color:#3d3d5a">-</span>';
  const pre  = a.preSsim  != null ? a.preSsim.toFixed(3)  : '?';
  const post = a.postSsim != null ? a.postSsim.toFixed(3) : '?';
  const delta = (a.preSsim!=null && a.postSsim!=null) ? a.postSsim - a.preSsim : null;
  let d = '';
  if(delta!=null){
    const cls = delta>=0?'up':'dn';
    d = ' <span class="'+cls+'">'+(delta>=0?'+':'')+delta.toFixed(2)+'</span>';
  }
  return pre+'<span class="arr"> -> </span>'+post+d;
}

// Return URL or null for each of the 4 image columns.
function thumbUrl(item, kind){
  const pid = pad(item.id);
  if(kind==='ref')     return 'texer_pngs/'+pid+'.png';
  if(kind==='before')  return (item.hasBeforeSnapshot && item.enqueueId)
    ? '../auto-fix/fix-snapshots/'+item.enqueueId+'-before.png' : null;
  if(kind==='after')   return (item.hasAfterSnapshot && item.commitHash)
    ? '../auto-fix/fix-snapshots/'+item.commitHash+'-after.png' : null;
  if(kind==='current') return 'htx_pngs/'+pid+'.png';
  return null;
}

function makeThumb(item, kind, label){
  const url = thumbUrl(item, kind);
  const wrap = document.createElement('div');
  wrap.className = 'thumb-mini' + (url?'':' empty');
  if(url){
    const img = document.createElement('img');
    img.src = url;
    img.onerror = ()=>{ wrap.classList.add('empty'); img.remove(); };
    wrap.appendChild(img);
  }
  const lbl = document.createElement('div');
  lbl.className = 'tlabel';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  return wrap;
}

function filteredData(){
  const fd = currentFilter==='all' ? DATA.slice() : DATA.filter(item => statusInfo(item).cat === currentFilter);
  if(currentSort === 'oldest') fd.reverse();
  return fd;
}

function renderList(){
  const fd = filteredData();
  const totalPages = Math.max(1, Math.ceil(fd.length/PAGE_SIZE));
  if(currentPage > totalPages) currentPage = totalPages;
  const slice = fd.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  document.getElementById('count-note').textContent =
    fd.length+' items, page '+currentPage+'/'+totalPages;

  const wrap = document.getElementById('list-wrap');
  wrap.innerHTML = '';
  if(!fd.length){
    wrap.innerHTML = '<div id="empty-msg">No items match this filter.</div>';
    renderPagination(0,0);
    return;
  }

  slice.forEach(item => {
    const si = statusInfo(item);
    const row = document.createElement('div');
    row.className = 'row' + (item.isProcessing?' processing':'');
    row.onclick = e => { if(e.target.classList.contains('fix-btn')) return; openModal(item); };

    const dot = document.createElement('div');
    dot.className = 'dot '+si.dotCls;
    row.appendChild(dot);

    const idEl = document.createElement('div');
    idEl.className = 'row-id';
    idEl.textContent = '#'+pad(item.id);
    row.appendChild(idEl);

    // 4 thumbs: texer | before | after | current
    const thumbs = document.createElement('div');
    thumbs.className = 'thumbs';
    thumbs.appendChild(makeThumb(item,'ref',    'texer'));
    thumbs.appendChild(makeThumb(item,'before', 'before'));
    thumbs.appendChild(makeThumb(item,'after',  'after'));
    thumbs.appendChild(makeThumb(item,'current','current'));
    row.appendChild(thumbs);

    const badge = document.createElement('span');
    badge.className = 'badge '+si.badgeCls;
    badge.textContent = si.label;
    row.appendChild(badge);

    const ssim = document.createElement('div');
    ssim.className = 'ssim-cell';
    ssim.innerHTML = ssimHtml(item);
    row.appendChild(ssim);

    const desc = document.createElement('div');
    const hasDesc = item.description && item.description.trim();
    desc.className = 'desc'+(hasDesc?'':' nodesc');
    desc.textContent = hasDesc ? item.description : 'no description';
    row.appendChild(desc);

    const ts = document.createElement('div');
    ts.className = 'ts-cell';
    ts.textContent = fmtTs(item.ts);
    row.appendChild(ts);

    const btn = document.createElement('button');
    btn.className = 'fix-btn';
    btn.textContent = 'fix';
    btn.title = 'Fix Again';
    btn.onclick = e => { e.stopPropagation(); fixAgain(item, btn); };
    row.appendChild(btn);

    wrap.appendChild(row);
  });

  renderPagination(currentPage, totalPages);
}

function renderPagination(page, total){
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';
  if(total <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'pg-btn'; prev.textContent = 'Prev';
  prev.disabled = (page <= 1);
  prev.onclick = () => { currentPage--; renderList(); };
  pg.appendChild(prev);
  const info = document.createElement('span');
  info.id = 'pg-info';
  info.textContent = 'Page '+page+' of '+total;
  pg.appendChild(info);
  const next = document.createElement('button');
  next.className = 'pg-btn'; next.textContent = 'Next';
  next.disabled = (page >= total);
  next.onclick = () => { currentPage++; renderList(); };
  pg.appendChild(next);
}

function openModal(item){
  _modalItem = item;
  const a = item.attempt;
  const si = statusInfo(item);

  document.getElementById('modal-title').textContent =
    '#'+pad(item.id) + (item.description ? ' - '+item.description : '');

  // 4 image columns: TeXeR ref | before | after (commit) | current
  const imgs = document.getElementById('modal-imgs');
  imgs.innerHTML = '';
  [
    {kind:'ref',     label:'TeXeR reference'},
    {kind:'before',  label:'HiTeXeR before'},
    {kind:'after',   label:'HiTeXeR after (commit)'},
    {kind:'current', label:'HiTeXeR current'},
  ].forEach(({kind,label})=>{
    const url = thumbUrl(item, kind);
    const col = document.createElement('div');
    col.className = 'mcol';
    const lbl = document.createElement('div');
    lbl.className = 'mcol-lbl';
    lbl.textContent = label;
    col.appendChild(lbl);
    if(url){
      const img = document.createElement('img');
      img.src = url;
      img.onerror = ()=>{ img.replaceWith(Object.assign(document.createElement('div'),{className:'mno',textContent:'(no image)'})); };
      col.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'mno';
      ph.textContent = kind==='before' ? 'not captured' : kind==='after' ? 'no commit yet' : '(no image)';
      col.appendChild(ph);
    }
    imgs.appendChild(col);
  });

  const meta = document.getElementById('modal-meta');
  meta.innerHTML = '';
  const fields = [
    ['status', '<span class="badge '+si.badgeCls+'">'+si.label+'</span>'],
    ['time',   fmtTs(item.ts)],
  ];
  if(a){
    if(a.preSsim!=null && a.postSsim!=null){
      const d = a.postSsim-a.preSsim;
      fields.push(['SSIM', a.preSsim.toFixed(3)+' -> '+a.postSsim.toFixed(3)+' ('+(d>=0?'+':'')+d.toFixed(3)+')']);
    }
    if(a.commit) fields.push(['commit', a.commit]);
  }
  fields.forEach(([k,v])=>{
    const f = document.createElement('div'); f.className = 'mfield';
    f.innerHTML = '<span class="mk">'+k+':</span><span class="mv">'+v+'</span>';
    meta.appendChild(f);
  });

  const notesEl = document.getElementById('modal-notes');
  const rawNotes = a && a.notes
    ? a.notes.replace(/\\s*\\|\\s*(ACCEPTED|CANARY-FAIL|VERIFIER-REJECT|VERIFIER-ERROR)[^|]*/gi,'').trim()
    : '';
  notesEl.style.display = rawNotes ? '' : 'none';
  notesEl.textContent = rawNotes;

  const fixBtn = document.getElementById('modal-fixbtn');
  fixBtn.disabled = false; fixBtn.textContent = 'Fix Again';
  document.getElementById('modal').classList.add('open');
}

function closeModal(){
  document.getElementById('modal').classList.remove('open');
  _modalItem = null;
}
document.getElementById('modal').addEventListener('click', e=>{
  if(e.target===document.getElementById('modal')) closeModal();
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

async function modalFixAgain(){
  if(!_modalItem) return;
  await fixAgain(_modalItem, document.getElementById('modal-fixbtn'));
}

async function fixAgain(item, btn){
  const desc = prompt('Describe what to fix (optional):', item.description||'');
  if(desc===null) return;
  btn.disabled = true; btn.textContent = 'Queuing...';
  try{
    const r = await fetch('http://localhost:7842/enqueue',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:item.id,description:desc}),
    });
    const j = await r.json();
    if(j.ok){ btn.textContent='Queued'; }
    else    { btn.textContent='Error'; btn.disabled=false; }
  } catch {
    btn.textContent='Server offline'; btn.disabled=false;
  }
}

document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.f;
    currentPage = 1;
    renderList();
  });
});

renderList();
</script>
</body>
</html>`;
}

if (require.main === module) {
  generate();
} else {
  module.exports = { generate };
}
