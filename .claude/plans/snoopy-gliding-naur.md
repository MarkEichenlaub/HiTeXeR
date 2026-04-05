# Fix GIF Frame Stabilization: Consistent Scale and Position

## Problem

When generating GIFs, each frame is rendered independently. This causes two issues:

1. **Scale varies per frame**: With `size(5cm)`, `pxPerUnit = targetSize / geoBboxW`. Since `geoBboxW` changes as the animated parameter changes, each frame has a different `pxPerUnit`. The existing code only saves `ppu` from the *first* frame but every frame's SVG was already rendered at its own scale.

2. **Position drift**: `gifStabilizeSvg` wraps each frame in a `<g>` with translation and sets a union viewBox, but since the underlying SVGs were rendered at *different scales*, the coordinate transforms don't actually align.

## Approach: Pass Forced Bounds into `renderSVG`

The clean fix is a true two-pass approach:

- **Pass 1** (already exists): Render all frames, compute union bounding box (minX/minY/maxX/maxY) and a single `pxPerUnit` derived from the union bbox.
- **Pass 2** (new): Re-render all frames with forced `pxPerUnit` and forced bounding box passed via `opts`, so every frame's SVG uses identical coordinate transforms.

This eliminates the need for `gifStabilizeSvg` post-hoc wrapping entirely — each frame's SVG will already be in the correct coordinate system.

## Files to Modify

### 1. `asy-interp.js` — `renderSVG()` (line ~4750)

Add support for `opts.forcedBounds` and `opts.forcedPxPerUnit`:

- After the bounding box computation (lines 4758-4853) and `geoBboxW/geoBboxH` (line 4860-4861), if `opts.forcedBounds` is provided, override `minX/minY/maxX/maxY` with the forced values.
- After `pxPerUnit` computation (lines 4909-4928), if `opts.forcedPxPerUnit` is provided, override `pxPerUnit` with the forced value.
- The forced bounds should be applied *after* the geometry bbox is computed (so `geoBboxW/H` still reflects the actual geometry for `pxPerUnit` calculation if `forcedPxPerUnit` is not set), but *before* any coordinate transforms.

Specifically, right after line 4861 (`const geoBboxH = maxY - minY || 1;`), insert:

```js
// GIF mode: override bounds with union bounds across all frames
if (opts.forcedBounds) {
  minX = opts.forcedBounds.minX;
  minY = opts.forcedBounds.minY;
  maxX = opts.forcedBounds.maxX;
  maxY = opts.forcedBounds.maxY;
}
```

Then right after line 4928 (end of pxPerUnit computation), insert:

```js
// GIF mode: override pxPerUnit with fixed value across all frames
if (opts.forcedPxPerUnit) {
  pxPerUnit = opts.forcedPxPerUnit;
}
```

### 2. `index.html` — `generateGif()` (line ~4395)

**Pass 1** — compute union bbox and a single `pxPerUnit`:

After the existing Pass 1 loop (lines 4460-4478), compute the canonical `pxPerUnit` from the union bounds. Use the same logic as `renderSVG`: if `size()` is present, compute `pxPerUnit = min(sizeW/unionGeoBboxW, sizeH/unionGeoBboxH)`. For simplicity, we already have `ppu` from the first frame's render. But since each frame could have different `ppu`, we need to compute one from the union bounds.

Actually, the simplest correct approach: **use the minimum `pxPerUnit` across all frames**. This ensures nothing gets clipped. When the union bbox is larger than any individual frame's bbox, and we use `size()`, the correct `pxPerUnit` for the union is `min(targetW / unionGeoBboxW, targetH / unionGeoBboxH)` — which naturally is the *smallest* `pxPerUnit` since the union bbox is the *largest*.

Change Pass 1 to track `geoBboxW/H` from each frame (we don't have these returned currently). **Simpler approach**: just track the minimum `pxPerUnit` across all rendered frames.

Updated Pass 1:
```js
let minPpu = Infinity;
// ... existing loop ...
  minPpu = Math.min(minPpu, result.pxPerUnit);
// ...
const fixedPpu = minPpu;
```

**Pass 2** — re-render with forced bounds and scale:

Replace the current Pass 2 approach. Instead of using `gifStabilizeSvg` on pre-rendered SVGs, re-render each frame by calling `AsyInterp.render()` again with `forcedBounds` and `forcedPxPerUnit`:

```js
const forcedBounds = { minX: uMinX, minY: uMinY, maxX: uMaxX, maxY: uMaxY };
for (let i = 0; i < totalFrames; i++) {
  const t = totalFrames === 1 ? 0 : i / (totalFrames - 1);
  const value = startVal + (endVal - startVal) * t;
  const result = renderFrame(value, { forcedBounds, forcedPxPerUnit: fixedPpu });
  // ... rasterize result.svg directly, no gifStabilizeSvg needed ...
}
```

Update `renderFrame` to pass opts through:
```js
function renderFrame(value, extraOpts) {
  // ...
  return AsyInterp.render(frameCode, { containerW: dims.w, containerH: dims.h, ...extraOpts });
}
```

Remove the `gifStabilizeSvg` call from Pass 2 (line 4535) since it's no longer needed.

### 3. `index.html` — `gifComputePreviewBounds()` and preview (line ~4228)

Apply the same fix to the preview path:
- In `gifComputePreviewBounds`, also track `minPpu` across samples.
- Store it in `gifPreviewBounds` as `fixedPpu`.
- In `gifUpdateVariable` (line 4338), pass `forcedBounds` and `forcedPxPerUnit` to `AsyInterp.render()`.
- Remove the `gifStabilizeSvg` call from the preview path (line 4348) since the render itself will produce correctly-sized SVGs.

### 4. Clean up `gifStabilizeSvg`

After the above changes, `gifStabilizeSvg` may no longer be needed. If both the GIF generation path and the preview path pass forced bounds directly, the function can be removed.

## Summary of Changes

| File | Change |
|------|--------|
| `asy-interp.js:~4862` | Add `opts.forcedBounds` override after bbox computation |
| `asy-interp.js:~4929` | Add `opts.forcedPxPerUnit` override after scale computation |
| `index.html:~4440` | Update `renderFrame` to accept and pass through extra opts |
| `index.html:~4460-4478` | Pass 1: also track `minPpu` across frames |
| `index.html:~4523-4563` | Pass 2: re-render frames with forced bounds/scale instead of post-hoc stabilization |
| `index.html:~4228-4260` | `gifComputePreviewBounds`: track min ppu, store in bounds object |
| `index.html:~4338-4348` | `gifUpdateVariable`: pass forced bounds/scale to render, remove `gifStabilizeSvg` call |
| `index.html:~4263-4282` | `gifStabilizeSvg`: remove (no longer needed) |

## Verification

1. Create an Asymptote drawing that uses `size(5cm)` with a circle whose radius is animated. Verify that in the GIF, the scale stays constant (a circle of radius 1 always appears the same size) and the origin stays fixed.
2. Test with `unitsize(1cm)` — should still work correctly (unitsize already gives fixed pxPerUnit, but forced bounds will prevent position drift).
3. Test with no size directive — verify auto-scaling uses consistent scale.
4. Test the live preview — verify it also stays stable.
