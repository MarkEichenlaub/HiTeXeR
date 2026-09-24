// Image upload for the hosted HiTeXeR (github.io), with no local server.
//
// A TeXeR diagram can only embed a picture that lives in an AoPS collection,
// so an inserted image has to be uploaded to AoPS first. The page can't do
// that itself: AoPS's upload call allows cross-origin requests, but the
// browser won't attach the AoPS login cookie to a request that starts on
// github.io, so AoPS answers "you have been signed out".
//
// So the upload runs inside an AoPS tab instead. HiTeXeR opens one, the user
// clicks the "HiTeXeR uploader" bookmark in it once, and that bookmark starts
// a small relay that accepts files from HiTeXeR (and only HiTeXeR) by
// postMessage and posts them to AoPS as the signed-in user.
//
// Conversion to EPS happens here too, in the browser: the image is drawn onto
// a white canvas and written as a Flate-compressed RGB EPS (lossless, and the
// same kind ImageMagick's eps3 writer produces). A PNG copy goes up next to
// the EPS so the hosted page can show the picture again later without a
// server to rasterize the EPS.

(function (root) {
  'use strict';

  const COLLECTION_ID = 400;
  const COLLECTION_BASE = 'https://cdn.artofproblemsolving.com/school/crypt/'
    + '00400-6ef848956f9c0207478f8f59ae54411efc0ce3f2/files';
  const AOPS_CDN_LOCAL = '/var/www/cdn';
  const BRIDGE_URL = 'https://artofproblemsolving.com/crypt/collection/' + COLLECTION_ID;
  const BRIDGE_NAME = 'htx-aops-uploader';
  const MAX_PX = 1000;
  const DEFAULT_SIZE_CM = 3.0;

  // Pages allowed to send files through the relay.
  const ALLOWED_ORIGINS = [
    'https://markeichenlaub.github.io',
    'http://localhost:7842', 'http://127.0.0.1:7842',
    'http://localhost:8080', 'http://127.0.0.1:8080',
  ];

  // ── EPS writing ─────────────────────────────────────────────────────────

  function ascii85(bytes) {
    const out = [];
    let line = '';
    const push = (s) => {
      for (const ch of s) {
        // Never start a line with '%': dvips treats those as comments.
        if (line.length === 0 && ch === '%') line = ' ';
        line += ch;
        if (line.length >= 76) { out.push(line); line = ''; }
      }
    };
    const n = bytes.length;
    let i = 0;
    for (; i + 4 <= n; i += 4) {
      let v = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      if (v === 0) { push('z'); continue; }
      const c = new Array(5);
      for (let k = 4; k >= 0; k--) { c[k] = String.fromCharCode(33 + (v % 85)); v = Math.floor(v / 85); }
      push(c.join(''));
    }
    const rem = n - i;
    if (rem > 0) {
      let v = 0;
      for (let k = 0; k < 4; k++) v = v * 256 + (k < rem ? bytes[i + k] : 0);
      const c = new Array(5);
      for (let k = 4; k >= 0; k--) { c[k] = String.fromCharCode(33 + (v % 85)); v = Math.floor(v / 85); }
      push(c.slice(0, rem + 1).join(''));
    }
    push('~>');
    if (line) out.push(line);
    return out.join('\n');
  }

  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // rgb: Uint8Array of width*height*3, top row first. Returns the EPS text.
  // One image pixel = 1 bp, as ImageMagick writes it; graphic()'s width=
  // option sets the size on the page anyway.
  async function rgbToEps(rgb, width, height) {
    const data = ascii85(await deflate(rgb));
    return [
      '%!PS-Adobe-3.0 EPSF-3.0',
      '%%Creator: HiTeXeR',
      `%%BoundingBox: 0 0 ${width} ${height}`,
      `%%HiResBoundingBox: 0 0 ${width} ${height}`,
      '%%LanguageLevel: 3',
      '%%Pages: 1',
      '%%EndComments',
      '%%Page: 1 1',
      'gsave',
      `${width} ${height} scale`,
      '/DeviceRGB setcolorspace',
      `<< /ImageType 1 /Width ${width} /Height ${height} /BitsPerComponent 8`,
      '   /Decode [0 1 0 1 0 1]',
      `   /ImageMatrix [${width} 0 0 -${height} 0 ${height}]`,
      '   /DataSource currentfile /ASCII85Decode filter /FlateDecode filter',
      '>> image',
      data,
      'grestore',
      'showpage',
      '%%EOF',
      '',
    ].join('\n');
  }

  function epsBoundingBox(text) {
    const head = text.slice(0, 16384);
    const hi = head.match(/^%%HiResBoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/m);
    const lo = head.match(/^%%BoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/m);
    const m = hi || lo;
    if (!m) return [100, 100];
    return [parseFloat(m[3]) - parseFloat(m[1]), parseFloat(m[4]) - parseFloat(m[2])];
  }

  function extOf(name) {
    const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  async function decodeToCanvas(blob, name) {
    const ext = extOf(name);
    let src, w, h, cleanup = () => {};
    if (ext === 'svg' || blob.type === 'image/svg+xml') {
      const url = URL.createObjectURL(blob);
      cleanup = () => URL.revokeObjectURL(url);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('Could not read that SVG.'));
        img.src = url;
      });
      w = img.naturalWidth || 300; h = img.naturalHeight || 300;
      src = img;
    } else {
      try {
        src = await createImageBitmap(blob);
      } catch (e) {
        throw new Error(`The browser can't read a .${ext || '?'} file. Save it as PNG or JPEG and try again.`);
      }
      w = src.width; h = src.height;
    }
    const scale = Math.max(w, h) > MAX_PX ? MAX_PX / Math.max(w, h) : 1;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    // EPS has no transparency, so flatten onto white rather than black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch);
    cleanup();
    if (src.close) src.close();
    return canvas;
  }

  // Returns {eps: Blob, png: Blob|null, width_bp, height_bp, png_b64|null}.
  async function convertImage(blob, name) {
    const ext = extOf(name);
    if (ext === 'eps' || ext === 'ps') {
      const text = await blob.text();
      const [w, h] = epsBoundingBox(text);
      return { eps: new Blob([text], { type: 'application/postscript' }), png: null,
               width_bp: w, height_bp: h, png_b64: null };
    }
    if (ext === 'pdf') {
      throw new Error("The hosted HiTeXeR can't convert a PDF. Save the page as a PNG and insert that.");
    }
    const canvas = await decodeToCanvas(blob, name);
    const w = canvas.width, h = canvas.height;
    const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
    }
    const eps = await rgbToEps(rgb, w, h);
    const pngUrl = canvas.toDataURL('image/png');
    const png_b64 = pngUrl.split(',', 2)[1];
    const png = await (await fetch(pngUrl)).blob();
    return { eps: new Blob([eps], { type: 'application/postscript' }), png,
             width_bp: w, height_bp: h, png_b64 };
  }

  function safeStem(name) {
    const base = (name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    const stem = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
    return stem || 'image';
  }

  function uploadStem(name) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const tag = Math.random().toString(36).slice(2, 10);
    return `htx_${stamp}_${tag}_${safeStem(name)}`;
  }

  function graphicLine(asyPath, w, h, sizeCm = DEFAULT_SIZE_CM) {
    const dim = w >= h ? 'width' : 'height';
    return `label(graphic("${asyPath}", "${dim}=${+sizeCm.toFixed(3)}cm"), (0,0));`;
  }

  // ── the relay that runs in the AoPS tab ────────────────────────────────

  // This function is serialized into the bookmark, so it has to stand alone.
  function bridgeMain(ALLOWED) {
    var banner = function (text, color) {
      var el = document.getElementById('htx-bridge-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'htx-bridge-banner';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:14px 18px;'
          + 'font:16px/1.4 system-ui,sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        document.body.appendChild(el);
      }
      el.style.background = color;
      el.textContent = text;
    };
    if (!/(^|\.)artofproblemsolving\.com$/.test(location.hostname)) {
      banner('The HiTeXeR uploader only works in the AoPS tab that HiTeXeR opens.', '#b00020');
      return;
    }
    var op = window.opener;
    if (!op) {
      banner('This tab wasn’t opened by HiTeXeR. Insert an image in HiTeXeR, then click the bookmark in the tab it opens.', '#b00020');
      return;
    }
    var announce = function () {
      ALLOWED.forEach(function (o) { try { op.postMessage({ type: 'htx-bridge-ready' }, o); } catch (e) {} });
    };
    if (!window.__htxBridge) {
      window.__htxBridge = true;
      window.addEventListener('message', function (e) {
        if (ALLOWED.indexOf(e.origin) < 0 || e.source !== op) return;
        var m = e.data || {};
        if (m.type === 'htx-ping') { e.source.postMessage({ type: 'htx-bridge-ready' }, e.origin); return; }
        if (m.type !== 'htx-upload') return;
        (async function () {
          var results = [];
          for (var i = 0; i < m.files.length; i++) {
            var f = m.files[i];
            var fd = new FormData();
            fd.append('a', 'upload_collection_file');
            fd.append('collection_id', String(m.collection));
            fd.append('file', f.blob, f.name);
            try {
              var r = await fetch('/m/crypt/ajax.php', { method: 'POST', body: fd, credentials: 'same-origin' });
              results.push({ name: f.name, status: r.status, text: await r.text() });
            } catch (err) {
              results.push({ name: f.name, error: String(err && err.message || err) });
            }
          }
          banner('HiTeXeR uploader is connected. Uploaded ' + m.files[0].name.replace(/\.[^.]*$/, '')
                 + '. Leave this tab open and go back to HiTeXeR.', '#1b7f3b');
          e.source.postMessage({ type: 'htx-upload-result', id: m.id, results: results }, e.origin);
        })();
      });
    }
    banner('HiTeXeR uploader is connected. Leave this tab open and go back to HiTeXeR.', '#1b7f3b');
    announce();
    try { op.focus(); } catch (e) {}
  }

  // Percent-encoded, since the browser decodes a javascript: URL before running it.
  const BOOKMARKLET = 'javascript:' + encodeURIComponent('(' + bridgeMain.toString().replace(/\s*\n\s*/g, ' ')
    + ')(' + JSON.stringify(ALLOWED_ORIGINS) + ');void 0');

  // ── the HiTeXeR side ────────────────────────────────────────────────────

  // Someone who has connected before gets the AoPS tab opened for them
  // straight away. A first-timer sees the instructions first, since the new
  // tab would otherwise jump in front of them.
  const CONNECTED_KEY = 'htx-aops-uploader-connected';
  function hasConnectedBefore() {
    try { return localStorage.getItem(CONNECTED_KEY) === '1'; } catch (e) { return false; }
  }

  let bridgeWin = null;
  let bridgeReady = false;
  let readyWaiters = [];
  const pending = new Map();

  if (typeof window !== 'undefined') {
    window.addEventListener('message', (e) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*artofproblemsolving\.com$/.test(e.origin)) return;
      const m = e.data || {};
      if (m.type === 'htx-bridge-ready') {
        bridgeWin = e.source;
        bridgeReady = true;
        try { localStorage.setItem(CONNECTED_KEY, '1'); } catch (err) {}
        const w = readyWaiters; readyWaiters = [];
        w.forEach((f) => f(true));
      } else if (m.type === 'htx-upload-result' && pending.has(m.id)) {
        pending.get(m.id)(m.results);
        pending.delete(m.id);
      }
    });
  }

  function waitReady(ms) {
    return new Promise((res) => {
      const t = setTimeout(() => {
        readyWaiters = readyWaiters.filter((f) => f !== done);
        res(false);
      }, ms);
      const done = (v) => { clearTimeout(t); res(v); };
      readyWaiters.push(done);
    });
  }

  function isAopsWindow(w) {
    try { void w.location.href; return false; } catch (e) { return true; }
  }

  // Must run synchronously inside the click/paste/drop, or the browser blocks
  // the new tab. Reuses the AoPS tab if one is already open.
  function openBridgeWindow() {
    if (bridgeWin && !bridgeWin.closed) return bridgeWin;
    let w = null;
    try { w = window.open('', BRIDGE_NAME); } catch (e) { w = null; }
    if (!w) return null;
    if (!isAopsWindow(w)) {
      // A brand-new blank tab: send it to AoPS.
      try { w.location.href = BRIDGE_URL; } catch (e) {}
    }
    bridgeWin = w;
    bridgeReady = false;
    return w;
  }

  async function pingBridge(ms) {
    if (!bridgeWin || bridgeWin.closed) return false;
    const p = waitReady(ms);
    for (const o of ['https://artofproblemsolving.com']) {
      try { bridgeWin.postMessage({ type: 'htx-ping' }, o); } catch (e) {}
    }
    return p;
  }

  // ── the connect dialog ──────────────────────────────────────────────────

  function showDialog(opts) {
    closeDialog();
    const ov = document.createElement('div');
    ov.id = 'htx-upload-dialog';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);'
      + 'display:flex;align-items:center;justify-content:center;font:14px/1.5 system-ui,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1e2330;color:#e8e8e8;max-width:520px;margin:16px;padding:20px 24px;'
      + 'border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    box.innerHTML = `
      <div style="font-size:17px;font-weight:600;margin-bottom:8px">Connect HiTeXeR to AoPS</div>
      <div>Pictures in a TeXeR diagram have to be hosted on AoPS, so HiTeXeR uploads them
      through an AoPS tab that's signed in as you.</div>
      <ol style="padding-left:20px;margin:10px 0">
        <li><b>First time only:</b> drag this button onto your bookmarks bar:<br>
          <a id="htx-bm-link" style="display:inline-block;margin:6px 0;padding:5px 12px;border-radius:6px;
             background:#e9c46a;color:#1e2330;font-weight:600;text-decoration:none;cursor:grab">HiTeXeR uploader</a>
          <div style="font-size:12px;opacity:.7">No bookmarks bar? Press Ctrl+Shift+B (Cmd+Shift+B on a Mac).</div></li>
        <li>In the AoPS tab HiTeXeR opened, sign in if asked, then click the
          <b>HiTeXeR uploader</b> bookmark.</li>
      </ol>
      <div id="htx-dlg-status" style="margin:8px 0;color:#e9c46a">${opts.status || 'Waiting for the AoPS tab...'}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="htx-dlg-open" style="padding:6px 12px">Open the AoPS tab</button>
        <button id="htx-dlg-cancel" style="padding:6px 12px">Cancel</button>
      </div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    const link = box.querySelector('#htx-bm-link');
    link.href = BOOKMARKLET;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setDialogStatus('Drag that button to your bookmarks bar, then click it in the AoPS tab.');
    });
    box.querySelector('#htx-dlg-open').addEventListener('click', () => {
      const w = openBridgeWindow();
      if (!w) setDialogStatus('The browser blocked the new tab. Allow pop-ups for this site and try again.');
      else { try { w.focus(); } catch (e) {} setDialogStatus('Waiting for the AoPS tab...'); }
    });
    box.querySelector('#htx-dlg-cancel').addEventListener('click', () => {
      closeDialog();
      if (opts.onCancel) opts.onCancel();
    });
  }
  function setDialogStatus(t) {
    const el = document.getElementById('htx-dlg-status');
    if (el) el.textContent = t;
  }
  function closeDialog() {
    const el = document.getElementById('htx-upload-dialog');
    if (el) el.remove();
  }

  async function ensureBridge() {
    if (bridgeReady && bridgeWin && !bridgeWin.closed && await pingBridge(1500)) return true;
    const w = hasConnectedBefore() ? openBridgeWindow() : null;
    if (w && await pingBridge(1500)) return true;
    let cancelled = false;
    showDialog({
      status: w ? 'Waiting for the AoPS tab...'
                : hasConnectedBefore() ? 'The browser blocked the AoPS tab. Click "Open the AoPS tab".'
                : 'When the button is on your bookmarks bar, click "Open the AoPS tab".',
      onCancel: () => {
        cancelled = true;
        const f = readyWaiters; readyWaiters = []; f.forEach((g) => g(false));
      },
    });
    const ok = await waitReady(10 * 60 * 1000);
    closeDialog();
    return ok && !cancelled;
  }

  function sendToBridge(files) {
    return new Promise((res, rej) => {
      const id = 'u' + Date.now() + Math.random().toString(36).slice(2, 6);
      const t = setTimeout(() => { pending.delete(id); rej(new Error('The AoPS tab stopped answering. Click the HiTeXeR uploader bookmark in it again.')); }, 180000);
      pending.set(id, (r) => { clearTimeout(t); res(r); });
      bridgeWin.postMessage({ type: 'htx-upload', id, collection: COLLECTION_ID, files },
                            'https://artofproblemsolving.com');
    });
  }

  function interpret(result) {
    if (result.error) throw new Error('Upload failed: ' + result.error);
    let j;
    try { j = JSON.parse(result.text); } catch (e) {
      throw new Error('AoPS sent back a page instead of an answer. Sign in to AoPS in that tab and try again.');
    }
    const code = j.error_code;
    if (code && code !== '0' && code !== 0) {
      if (code === 'E_LOGGED_OUT') throw new Error('You are signed out of AoPS. Sign in in the AoPS tab, click the HiTeXeR uploader bookmark again, and retry.');
      // AoPS's file listing can throw after a good upload; the caller checks
      // the CDN before believing this.
      return { base: null, error: String(j.error_msg || code) };
    }
    const files = (j.response || {}).files;
    let base = files && files.url ? String(files.url) : null;
    if (base && base.startsWith('//')) base = 'https:' + base;
    return { base: base ? base.replace(/\/+$/, '') : null, error: null };
  }

  function imageLoads(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    });
  }

  function upload(blob, filename, onStatus) {
    // Open the AoPS tab now, while the click/paste/drop still counts as a
    // user action; after the first await the browser would block it.
    if (!(bridgeWin && !bridgeWin.closed) && hasConnectedBefore()) openBridgeWindow();
    return uploadAfterOpen(blob, filename, onStatus);
  }

  async function uploadAfterOpen(blob, filename, onStatus) {
    onStatus && onStatus('Converting ' + filename + '...');
    const conv = await convertImage(blob, filename);
    const stem = uploadStem(filename);
    const files = [{ name: stem + '.eps', blob: conv.eps }];
    if (conv.png) files.push({ name: stem + '.png', blob: conv.png });

    onStatus && onStatus('Waiting for the AoPS tab...');
    if (!await ensureBridge()) throw new Error('Upload cancelled.');

    onStatus && onStatus('Uploading ' + filename + ' to AoPS...');
    const results = await sendToBridge(files);
    const eps = interpret(results[0]);
    const base = eps.base || COLLECTION_BASE;
    const url = base + '/' + files[0].name;
    if (eps.error) {
      const check = conv.png ? await imageLoads(base + '/' + files[1].name) : false;
      if (!check) throw new Error('AoPS refused the upload: ' + eps.error);
    }
    const asyPath = AOPS_CDN_LOCAL + url.replace(/^https?:\/\/[^/]+/, '');
    return {
      path: asyPath,
      url,
      filename: files[0].name,
      width_bp: conv.width_bp,
      height_bp: conv.height_bp,
      png_b64: conv.png_b64,
      asy: graphicLine(asyPath, conv.width_bp, conv.height_bp),
    };
  }

  // For a graphic() path with no server around: the PNG copy uploaded next to
  // the EPS. Resolves {href, width_bp, height_bp} or null.
  function companionPng(asyPath) {
    if (!asyPath.startsWith(AOPS_CDN_LOCAL + '/') || !/\.eps$/i.test(asyPath)) return Promise.resolve(null);
    const href = 'https://cdn.artofproblemsolving.com' + asyPath.slice(AOPS_CDN_LOCAL.length).replace(/\.eps$/i, '.png');
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ href, width_bp: img.naturalWidth, height_bp: img.naturalHeight, png_b64: null });
      img.onerror = () => res(null);
      img.src = href;
    });
  }

  const api = { upload, companionPng, convertImage, rgbToEps, ascii85, epsBoundingBox,
                BOOKMARKLET, COLLECTION_ID, COLLECTION_BASE, ALLOWED_ORIGINS, bridgeMain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HTXAopsUpload = api;
})(typeof window !== 'undefined' ? window : globalThis);
