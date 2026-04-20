# HiTeXeR Project Instructions

## Version Number

Every time you edit HiTeXeR, bump the version number in `index.html` (search for the `v` string in the `<h1>` header, around line 340) so the user can confirm they're seeing the latest changes.

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
