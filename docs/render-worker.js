'use strict';
// render-worker.js — runs AsyInterp.render() off the main thread so the editor
// stays responsive while a big diagram renders. index.html talks to it through
// HTXRenderClient (see there): one request in, one {id, result|error} out.
//
// The worker loads the same three scripts the page does (KaTeX, the KaTeX SVG
// emitter, the interpreter) plus the glyph table, so its output is identical
// to a main-thread render with the emitter ready. Messages:
//   in:  {type:'render', id, code, opts}
//   out: {type:'ready'} once loaded; {type:'result', id, result} or
//        {type:'error', id, message}

self.window = self;  // asy-interp.js / katex-svg.js attach to `window`

let ready = false;
let loadError = null;
try {
  importScripts(
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    'katex-svg.js',
    'asy-interp.js'
  );
} catch (e) {
  loadError = 'worker script load failed: ' + (e && e.message || e);
}

const glyphsReady = loadError ? Promise.resolve() :
  fetch('katex-glyphs.json').then(r => r.json())
    .then(d => { if (self.katexSvg) self.katexSvg.init(d); })
    .catch(e => { loadError = 'glyph table load failed: ' + (e && e.message || e); });

glyphsReady.then(() => {
  ready = !loadError;
  self.postMessage(loadError ? { type: 'failed', message: loadError } : { type: 'ready' });
});

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type !== 'render') return;
  glyphsReady.then(() => {
    if (!ready) { self.postMessage({ type: 'error', id: msg.id, message: loadError || 'worker not ready' }); return; }
    try {
      const result = self.AsyInterp.render(msg.code, msg.opts || {});
      self.postMessage({ type: 'result', id: msg.id, result });
    } catch (e) {
      self.postMessage({ type: 'error', id: msg.id, message: String(e && e.message || e) });
    }
  });
};
