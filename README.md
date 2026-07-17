# HiTeXeR

An interactive, in-browser Asymptote editor: write Asymptote code and see it
rendered live, with an AI assistant for generating, explaining, and fixing
diagrams.

## Try it online

https://markeichenlaub.github.io/HiTeXeR/

The hosted version runs entirely client-side, using a JS Asymptote
interpreter (`asy-interp.js`) for the live preview — nothing to install. It
can't do everything, though: AI features and the "Use Real Asymptote"
fallback both require a local server. Run it locally for the full
experience.

## Running locally

### Prerequisites

- **Python 3** — runs the local server (standard library only, no venv
  needed for basic use).
- **[Asymptote](https://asymptote.sourceforge.io/)** — `server.py` expects
  it at `C:\Program Files\Asymptote\asy.exe` (edit the `ASY_EXE` constant
  near the top of `server.py` if yours is elsewhere). Needed for "Use Real
  Asymptote" and for AI features, which compile generated code to verify it
  works before returning it.
- **`dvisvgm`** on your `PATH` — converts Asymptote's PDF output to SVG.
  Comes with most TeX distributions (e.g. MiKTeX).
- **[Ghostscript](https://www.ghostscript.com/)** (optional) — only needed
  to embed AoPS CDN EPS images (`/var/www/cdn/...` paths) when rendering
  with real Asymptote.
- **[Claude Code CLI](https://docs.claude.com/en/docs/claude-code)**
  (optional, for AI features) —
  `npm install -g @anthropic-ai/claude-code`, then run `claude` once to log
  in with your Claude subscription. No API key is used anywhere.
- `pip install requests beautifulsoup4` (optional) — only needed for
  "Import from TeXeR..." (fetching Asymptote source from an AoPS TeXeR URL).

### Start the server

```
python server.py
```

Then open http://127.0.0.1:8080/. Ctrl+C to stop.

On Mark's machines this is bound to **CapsLock+H** (see
`autohotkey-scripts/default.ahk`), which kills anything already listening on
port 8080, starts `server.py`, polls `/health` until it responds, and opens
the browser automatically.

## AI features

The AI panel ("AI Chat" button, top right) and the "AI Edit" bar (bottom of
the editor) all shell out server-side to the `claude` CLI
(`call_claude()` / `call_claude_vision()` in `server.py`), so they bill
against your Claude subscription like every other AI task on this
machine — never the Anthropic API. Code-generation calls (AI Edit, Refactor,
and their internal fix/revision passes) default to `claude-fable-5`,
overridable with the `CLAUDE_MODEL` env var; chat, critique, learn, lint-fix,
and autocomplete are hardcoded to `claude-sonnet-5`.

- **AI Edit** — describe what you want (text and/or an uploaded reference
  image) and it generates or modifies the Asymptote code, then runs a
  compile-and-critique loop (up to 5 rounds) comparing the render against
  your request before returning it.
- **AI Chat** — conversational Q&A about the current code; can propose code
  changes inline. Checkboxes let you restrict it to explanations only,
  visually-identical edits only, or comment-only edits.
- **Refactor** — rewrites the code to follow the team's Asymptote style
  guide, re-rendering and pixel-diffing against the original to verify the
  output image doesn't change.
- **Learn** — generates a line-by-line explanation of the current diagram's
  code.
- **Lint / AI Fix** — compiles with real Asymptote to surface errors and
  warnings inline, and can suggest a fix for a specific error line.
- **Autocomplete** — context-aware completions as you type.

## For maintainers: the comparison/regression pipeline

A second local server, `fix-server.js` (Node — run `npm install` first), backs
the Blink Comparator, which diffs HiTeXeR's renders against real AoPS TeXeR
output and drives the auto-fix loop. Start it with `node fix-server.js`
(serves `http://localhost:7842`; bound to **CapsLock+V**). This is a
development tool for improving the JS interpreter — not needed for normal
use of HiTeXeR.
