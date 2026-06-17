# HiTeXeR Project Instructions

## Version Number

Every time you edit HiTeXeR, bump the version number in `index.html` (search for the `v` string in the `<h1>` header, around line 340) so the user can confirm they're seeing the latest changes.

## Cache-busters (CRITICAL — or browser won't load your changes)

`index.html` loads `asy-interp.js` and `katex-svg.js` with a `?v=...` query-string
cache-buster (e.g. `<script src="asy-interp.js?v=8.80">`). The browser caches by
the full URL, so if the `?v=` string is unchanged it serves the OLD file even
after you edit it — your fixes silently never reach the browser (the `<h1>`
version updates because index.html itself reloads, masking the problem).
**Whenever you edit `asy-interp.js` or `katex-svg.js`, bump BOTH `?v=` strings
to the new HiTeXeR version** (keep them in sync with the `<h1>` version). Node
renders (`_render_one.js` etc.) read the file directly and are unaffected, so a
fix can pass node verification yet be invisible in the browser — always bump.

## Do NOT delete corpus or rendered images

The following directories contain hard-to-regenerate data and must NEVER be deleted,
emptied, or "cleaned up" without explicit user approval:

- `asy_corpus/`              — original .asy source files scraped from AoPS + Asymptote gallery
- `comparison/asy_src/`      — numeric-renamed copies of the .asy sources used by the pipeline
- `comparison/texer_pngs/`   — reference PNGs fetched from the AoPS TeXeR service (a single
                                refetch of all ~12,000 takes many hours and requires VPN)

If a pipeline step appears to need "stale" state cleared, clear only the specific
output it regenerates (e.g. `htx_svgs/`, `htx_pngs/`, `ssim-results.json`), never
the corpus or `texer_pngs/`. When in doubt, ask the user first.

## Dot-rendering regressions (READ BEFORE TOUCHING `dot()` LOGIC)

Dots rendering "too big" is a recurring regression that has shipped at least
three times. The root cause is always one of these two interactions; preserve
both behaviors when editing `dot()` rendering or the auto-stroke boost.

### 1. The `dot(z, color+N)` AoPS idiom: `dotLw >= 1` ⇒ direct diameter

AoPS authors write `dot(z, 3+black)`, `dot(z, black+2bp)`, `dot(z, red+6)`, etc.
where the small integer/float is intended as the **dot diameter in bp**, NOT
as a stroke linewidth to be multiplied by `dotfactor` (which is 6, so the
naive Asymptote formula `dotfactor*lw/2` would render a `+3` dot at 9 bp
radius / 18 bp diameter — vastly too big, overlapping in lattice grids).

The threshold for switching from "dotfactor*lw/2" to "lw/2" (direct diameter)
is `dotLw >= 1`:
- `lw < 1` (e.g. `dp = black + 0.75` in 05895): keep `dotfactor*lw/2` so a
  stroke pen reused as a dot pen still renders a visible mark.
- `lw >= 1` (e.g. 08663 `+3`, 08733 `+2bp`, 08750 `linewidth(1.2)`,
  09162 `black+3`, 06256 `red+6`, 12087 `ds=6`): use the linewidth as the
  dot diameter directly.

This threshold lives in **three** places in `asy-interp.js` — keep them
consistent:
- the viewBox-padding pass (search `_useDirectDiameter`)
- the `dotRadiusAtPos` label-push map (`_useDirectDiameter_lpush`)
- the actual dot rendering (`useDirectDiameter`)

DO NOT raise this threshold to "fix" 05895 (`dp=black+0.75`). 05895 stays
visible with `lw=0.75 < 1` ⇒ dotfactor branch (radius 2.25, diameter 4.5 bp).
Raising the threshold to 2 or 3 immediately re-breaks the entire
`dot(z, 3+black)` and `dot(z, black+2bp)` corpus (08663, 08666, 08733, 08750,
09162, etc.).

### 2. Auto-stroke boost on 1D-degenerate geometry

For auto-scaled diagrams (no `size()`, no `unitsize()`) with very high aspect
ratios, default-pen strokes get a 1×→5× linear-ramp boost so they survive
SSIM's trim+resize compression. But when the geometry is **1D-degenerate**
(all geometry collinear — every `dot((j,0))` along y=0 in 09210, or
dot+arrow chain at y=0 in 09212), the padded "aspect ratio" balloons to
100s because the y-extent is just stroke padding. The 5× boost then
multiplies the dot/stroke that IS the geometry.

The fix is the `geoIs1D` flag set near the geometry bbox computation:
```js
const geoIs1D = !geoIsDegenerate &&
  ((maxX - minX) === 0 || (maxY - minY) === 0);
```
When set, the boost is forced to 1.67× (DPI ratio), bypassing the linear
ramp. DO NOT remove this branch when refactoring the boost block —
without it, 09210, 09212, and similar dot-line diagrams immediately
re-bloat to 5× dot radius.

### Verification protocol

After ANY change to `dot()` rendering or the `_autoScaledStrokeBoost` block,
visually check these representative IDs against `comparison/texer_pngs/`:
- **Bloat-prone (must stay small):** 09210, 09212, 08663, 08666, 08733,
  08750, 09162
- **Visibility-prone (must stay visible):** 05895 (UnFill open dot),
  06256 (red+6), 09343 (defaultpen-linewidth(1) with bare `dot()`)
- **Should not change:** 01153 (tall-thin auto-scaled), 05883 (flat-banner
  number line)

## `import palette;` and the colorbar/contour module

The `palette` module's built-ins (`Automatic`, `Full`, `Range()`, `uniform()`,
`palette()` colorbar legend form, `PaletteTicks()`, `image()` function form,
`Rainbow`, `BWRainbow`, `Wheel`, `Gradient`, `_emptyBounds`, `_paletteLegend`,
`_formatPaletteTick`) are **defined inside `installThreePackage(env)`** —
they're shared with 3D `surface()` colouring and live in the same install
function. To make them available for 2D contour-plot diagrams (e.g. 12726,
which only does `import graph; import palette; import contour;`), the
import-dispatch in `evalImport` triggers `installThreePackage` on
`mod.includes('palette')` as well as the 3D-related modules. DO NOT remove
the `palette` branch from that condition — without it, `image()` returns
undefined and `Automatic` is unbound, so the entire diagram renders as
empty axes.

`bounds` is a plain `{_tag:'bounds', min, max}` object returned by `image()`.
The colorbar legend form of `palette()` is detected by signature: it has a
`bounds` arg and at least two `pair` args (the legend rectangle corners).
The same `palette()` symbol still routes to `_paletteStub` (vertex-coloring)
when neither bounds nor pairs are present.
