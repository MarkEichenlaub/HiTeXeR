# Make hover interaction feel near-instantaneous

## Context

The earlier fix (v9.32, `distToElementScreen`) removed the ~1.2 s-per-mousemove lag by
caching per-element sample points instead of calling `getPointAtLength` on every move.
It's now functional but "not smooth," and **adding the dynamic label
`label("$f = " + format("%.3f", fraction) + "$", I)` noticeably increases the lag.**

In-browser profiling (root `index.html`, this diagram) pinpoints exactly why:

- Per-move hit-test is already cheap: `getScreenCTM()` for **all** elements ≈ 0.05 ms;
  one warm hover ≈ 0.9 ms. The dynamic label does **not** change the per-move median
  (8 ms vs 7.9 ms).
- The real cost is the **one-time sample-cache warm on the *first* hover after each
  render**. Fresh SVG nodes ⇒ cold cache ⇒ the first mousemove samples every element:
  - **static `$f$` label: 270 ms** first-hover hitch
  - **dynamic `$f = 0.601$` label: 597 ms** first-hover hitch
- Cause: `getPointAtLength` costs ~**1 ms per call**. Per-element/24-sample cost measured:
  straight strokes **0.1 ms**, the circle **14 ms**, **each glyph 22–39 ms**. The label
  glyph outlines dominate, so a longer dynamic label (10 glyphs vs 4) more than doubles
  the hitch. By contrast **`getBBox()` is ~free (0–0.1 ms) for every element.**

So the warm runs on the interaction path and scales with glyph count — precisely the
"not smooth, worse with the dynamic label" symptom. Goal: make first-hover-after-render
instant and decouple cost from glyph count.

## Approach

Two changes to `_htxElementLocalSamples` + its scheduling in `index.html`
(and mirror to `docs/index.html`). No change to the per-move math (`distToElementScreen`),
which is already sub-millisecond.

### 1. Sample glyphs/fills with `getBBox` instead of `getPointAtLength` (primary)

In **`_htxElementLocalSamples(el)`** (`index.html` ~3318), classify the element:

- **Filled elements** — `el.getAttribute('fill')` is set and not `'none'` (this covers
  all KaTeX glyph `<path>`s, which also carry a `scale(...)` transform, plus filled
  polygons): sample a small **grid over `getBBox()`** (e.g. 4×4 local points). One cheap
  `getBBox` call, no `getPointAtLength`. This is also *more correct* for fills/labels —
  it detects the interior, where the old perimeter sampling did not.
- **Stroke-only paths** — `fill === 'none'` with a stroke (triangle sides, the incircle):
  keep `getPointAtLength` sampling (needed for accurate distance to open curves). These
  are few; straight lines are ~0.1 ms, curves a few ms — absorbed by change #2.

Net warm cost for this diagram drops from ~600 ms to roughly ~15–20 ms (only the stroke
curves cost anything), and the **dynamic-label penalty effectively disappears** (glyphs
become free). Distance semantics are unchanged: strokes still measured to the curve,
glyphs/fills to their box. Reuse the existing bbox-grid fallback already in the function
(currently the `s.length === 0` branch) — promote it to the primary path for filled elements.

### 2. Warm the cache off the interaction path (primary)

Pre-fill the cache right after each render so the *first* hover is never the thing that
pays. Add one listener (DRY, independent of which setup function ran):

```js
document.addEventListener('hitexer-rendered', () => {
  const svg = document.querySelector('#preview-container svg:not([data-perm])');
  if (!svg) return;
  const els = [...svg.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect,text')]
    .filter(e => !e.closest('defs'));
  const warm = () => { for (const el of els) _htxElementLocalSamples(el); };
  (window.requestIdleCallback || requestAnimationFrame)(warm);
});
```

`hitexer-rendered` already fires after render (`index.html:3168` and `:3236`) and is
already consumed elsewhere (`:4979`, `:7395`). Warming in idle time means even the
residual stroke-curve cost never blocks input; by the time the user moves the mouse the
cache is hot ⇒ every move ~1 ms.

### 3. (Optional, only if still not glassy) rAF-throttle the hover handler

The `svg.addEventListener('mousemove', …)` hover handler (`index.html` ~4082) runs the
hit-test + highlight rebuild synchronously on every move whose nearest element changed.
After 1+2 that's ~1 ms, but browsers can fire mousemove faster than 60 Hz. Coalescing to
one run per animation frame (store last event, do the work in a single `requestAnimationFrame`)
caps per-frame work and guarantees smoothness regardless of move rate. Low risk; add only
if the user still perceives micro-jank after 1+2.

## Realistic outcome

After 1+2: hit-test ~0.05 ms, highlight ~1 ms, warm moved to idle and ~30× cheaper.
First-hover-after-edit hitch goes from 270–600 ms to imperceptible, and the dynamic
label no longer adds noticeable cost. This is "almost instantaneous" — the remaining
~1 ms/move is well inside a 16 ms frame. The honest ceiling: the highlight glow uses a
`feGaussianBlur` filter whose GPU paint isn't captured in JS timing; if any softness
remains it's paint, addressed by the optional #3 throttle or a lighter highlight, not by
more hit-test optimization.

## Files to modify

- `index.html` — `_htxElementLocalSamples` (~line 3318): add fill/glyph bbox branch;
  add the `hitexer-rendered` warm listener; optionally rAF-throttle the mousemove handler (~4082).
- `docs/index.html` — apply the same edits (identical hover code; keeps the public
  GitHub Pages page fast). Bump the version span to match root.
- Version bump in `index.html` `<h1>` span per project rule (CLAUDE.md).

No interpreter/render changes ⇒ no canary/ssim regeneration needed.

## Verification (in-browser, via fix-server on :7842)

Re-run the same profiling harness used to diagnose this:

1. **Cold first-hover after render** (the key metric): load the diagram with the dynamic
   label, `editor.setValue(...)`, wait for render, then time the *first* dispatched
   `mousemove`. Target: **< 16 ms** (was 597 ms). Confirm static vs dynamic label are now
   ~equal (glyphs free).
2. **Warm per-move**: dispatch 40 random mousemoves; median should stay ~1–3 ms.
3. **Accuracy unchanged**: point ON the incircle stroke → distance ~5 px (stroke path
   still sampled); point on a glyph → ~0 (now via bbox interior); far point → large.
   Hover the incircle with the real cursor → it glows and source line 11 highlights.
4. **Giant-symbol regression intact**: toggle Slide on/off → 0 broken glyphs, clean render.
5. **No console errors** on load; AI features still absent in `docs/`.
