# KaTeX fork plan — label fidelity beyond off-the-shelf

Status: **plan only, not started.** Written 2026-06-11 after the v8.09 label
overhaul. Read `_lblprobe.js` first — it is the measurement harness that
justifies everything below (renders label specimens through local Asymptote
(real LaTeX/Computer Modern via dvisvgm) and through both HTX paths, then
compares ink boxes in bp).

## Where we are after v8.09 (off-the-shelf fixes)

All 31 probe specimens are within ~1bp of real LaTeX output on both render
paths. The fixes that got us here did NOT require forking anything:

| Issue | Root cause | Fix |
|---|---|---|
| Minus signs short (browser) | ASCII hyphen in SVG text | U+2212 in math mode |
| Character spacing (browser) | No TeX muskips in SVG text | shared math tokenizer emits medmuskip/thickmuskip/thinmuskip as tspan dx |
| Mixed labels upright + hyphenated (pipeline) | dead `typeof katex` gate in node | route through MathJax in svg-native |
| All labels ~6% short (pipeline) | horizontal-only 1.072 stretch | uniform `_MJX_SCALE` |
| Mixed-label prose 17% small + Times font (browser) | `/1.21` wrapper div; KaTeX_Main missing from font stack | 1.21em spans; KaTeX_Main first |
| Placement shifts | char-count width heuristic; font-box vs ink-box centering | KaTeX/canvas measurement |
| \frac bar overhang | MathJax hard-coded 0.1em rule overhang | runtime prototype patch (pinned 3.2.1) |

## Remaining gaps and whether a fork would fix them

1. **±0.5–1bp residual glyph metrics.** The `_MJX_SCALE = 1.072` correction is
   a single global constant compensating MathJax's em/ex unit conventions
   (em = fontSize/1.21 from KaTeX-compat, ex assumed 0.5em vs real 0.431).
   Per-glyph advance error after the constant is sub-1%. A fork buys at most
   a few tenths of a bp here. **Not worth a fork.**
2. **NE/diagonal-aligned labels ~1.2bp off (both paths).** This is HiTeXeR's
   alignment geometry (L∞ normalization + margin push vs Asymptote's corner
   placement), not KaTeX. **Fix in asy-interp.js, no fork.**
3. **foreignObject dependence in the browser.** KaTeX outputs HTML/CSS only;
   the browser editor embeds it in `<foreignObject>`, which (a) cannot be
   rasterized by librsvg/sharp, (b) needs katex.min.css in scope, so SVGs
   exported from the browser are not self-contained, and (c) forces the
   measure-then-place dance (`_katexMeasureBp`). This is the ONE structural
   limitation of stock KaTeX. The current workaround is the MathJax SVG path
   for rasterization — which is why HiTeXeR carries two math engines with two
   sets of unit conventions kept in sync by hand (`_MJX_SCALE`, the 1.21
   factors, the mfrac patch).

## If we fork: the actual prize is a KaTeX SVG backend

The fork worth doing is not "tweak fonts": it is adding an **SVG output
emitter** to KaTeX so one engine serves both the browser editor and the
rasterization pipeline with identical geometry.

Why KaTeX rather than staying on MathJax for everything: KaTeX's
`renderToString` is ~5–20× faster than MathJax's full document pipeline per
expression (this matters in the live editor, which re-renders per keystroke),
and its layout is already the TeX algorithm with TeX's spacing constants.

### Scope A — cheap patches (do first, fork-lite via `patch-package`)
- Pin `katex@0.16.11`; add `patch-package` to `postinstall`.
- Remove the `.katex { font-size: 1.21em }` indirection (or neutralize with a
  CSS override — already possible without forking) so label font-size math
  loses the /1.21 fudge in `renderLabelKaTeX`, `_katexMeasureBp`.
- Expose KaTeX's internal build tree (`katex.__renderToDomTree` is already
  public) — no patch needed; document that the SVG emitter (Scope B)
  consumes it.
- Estimated effort: half a day, fully reversible, zero perf cost.

### Scope B — SVG emitter (the real fork)
- New module `katex-svg.js` (can live in HiTeXeR, consuming the public
  `__renderToDomTree`; only becomes a true fork if internals need patching):
  walk KaTeX's DomTree (spans with `height`/`depth`/`italic` metrics, kern
  nodes, rules, svg-wrapped delimiters), accumulate x-cursor exactly like the
  CSS layout would, and emit `<text>`/`<use>` or glyph `<path>` elements.
- Glyph outlines: extract once from the KaTeX woff2 fonts into a JSON path
  table keyed by font/family/char (build step, ~300KB gzipped for the faces
  the corpus uses; lazy-load per face). Emitting `<path>` makes output
  self-contained for librsvg, blink, and `<img>` embedding.
- Vertical metrics come straight from KaTeX's fontMetricsData (true TeX tfm
  values) — no more 0.431-vs-0.5 ex guessing, no `_MJX_SCALE`.
- Performance: parse+build is unchanged (KaTeX core); the emitter is a linear
  tree walk — comparable to renderToString. Cache by (tex, size) exactly like
  `_mjxCache` today.
- Acceptance gate: `_lblprobe.js` extended with ~30 more specimens (scripts,
  radicals with indices, \overline/\underbrace, stacked limits, colors);
  every specimen within 0.5bp of the local-asy oracle; full corpus canary
  (fresh HEAD-vs-branch comparison, NOT the stale canary.json baselines);
  visual spot-check in the browser editor per `feedback_verify_in_browser`.
- Estimated effort: 1–2 weeks. Risk: medium (delimiter assembly and accent
  positioning are the fiddly parts).
- Kill criterion: if Scope B specimens show the MathJax path already ≤0.5bp
  everywhere after Scope A, stop — the duality is an aesthetic cost, not a
  fidelity one.

### Explicitly NOT planned
- Replacing KaTeX fonts with "real" Computer Modern: KaTeX's faces are
  CM-derived with tfm-faithful metrics; the probe shows the discrepancies are
  unit conventions, not glyph shapes.
- Forking MathJax: the mfrac rule-overhang prototype patch (asy-interp.js,
  `_ensureMathJax`) is the only behavioral change we need and it is already
  applied at runtime against the pinned 3.2.1.
