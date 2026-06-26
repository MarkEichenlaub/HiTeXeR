/* HiTeXeR render worker.
 *
 * Runs the SAME interpreter (katex + katex-svg + asy-interp) the main thread
 * uses, but OFF the main thread, so the comparator's bulk thumbnail / side
 * renders never block menu interaction or navigation. Output matches the node
 * pipeline: `document` is undefined here (as in node), so measurement flows
 * through the katexSvg glyph emitter — the same engine used for SSIM.
 *
 * asy-interp.js ends with `window.AsyInterp = {...}` and katex-svg.js attaches
 * to `window`, so we alias window->self BEFORE importing. The DOM is never
 * touched (all real-DOM paths are `document`-gated and skipped here).
 *
 * If anything fails to load or the self-test render throws, we post
 * 'init-failed' and the main thread transparently falls back to inline
 * rendering (no behavior change vs. the pre-worker comparator).
 */
'use strict';
self.window = self;

let booted = false;

function boot() {
  if (booted) return;
  booted = true;
  try {
    importScripts('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js');
    importScripts('../katex-svg.js');
    importScripts('../asy-interp.js');
  } catch (e) {
    self.postMessage({ type: 'init-failed', error: 'importScripts: ' + (e && e.message) });
    return;
  }
  fetch('../katex-glyphs.json')
    .then(r => r.json())
    .then(glyphs => {
      try { if (self.katexSvg && self.katexSvg.init) self.katexSvg.init(glyphs); } catch (e) { /* fall back to estimator */ }
      // Self-test: prove a trivial diagram renders to an <svg>. If not, bail so
      // the main thread keeps rendering inline (zero regression).
      try {
        const t = self.AsyInterp.render('draw((0,0)--(1,1)); label("$x$",(0,0));',
          { containerW: 200, containerH: 200, imageCache: {} });
        if (!t || !t.svg || t.svg.indexOf('<svg') === -1) throw new Error('self-test produced no svg');
      } catch (e) {
        self.postMessage({ type: 'init-failed', error: 'self-test: ' + (e && e.message) });
        return;
      }
      self.postMessage({ type: 'ready' });
    })
    .catch(e => self.postMessage({ type: 'init-failed', error: 'glyphs: ' + (e && e.message) }));
}

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'init') { boot(); return; }
  if (msg.type === 'render') {
    let svg = null;
    try {
      if (self.AsyInterp && self.AsyInterp.canInterpret(msg.code)) {
        const result = self.AsyInterp.render(msg.code,
          { containerW: 800, containerH: 600, imageCache: msg.imageCache || {} });
        svg = (result && result.svg) || null;
      }
    } catch (err) { svg = null; }
    self.postMessage({ type: 'result', reqId: msg.reqId, svg });
  }
};
