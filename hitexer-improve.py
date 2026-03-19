#!/usr/bin/env python3
"""
HiTeXeR automated improvement loop.

Compares HiTeXeR SVG output against AoPS TeXeR PNG renders, uses Claude to
describe differences and write fix prompts, then modifies asy-interp.js.
Iterates up to max_cycles per diagram, generates an HTML report at the end.

Usage:
    python hitexer-improve.py [--diagrams N] [--max-cycles M] [--output-dir DIR]
    python hitexer-improve.py --file c95_L6_script_4.asy

Requirements:
    pip install selenium webdriver-manager Pillow numpy
"""

import argparse
import base64
import difflib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import webbrowser
from datetime import datetime
from pathlib import Path


try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Error: Pillow and numpy required. Run: pip install Pillow numpy")
    sys.exit(1)

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.chrome.service import Service

try:
    from webdriver_manager.chrome import ChromeDriverManager
    USE_WDM = True
except ImportError:
    USE_WDM = False

# ── Paths ────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
COMPARISON = ROOT / "comparison"
SSIM_RESULTS = COMPARISON / "ssim-results.json"
ASY_SRC_DIR = COMPARISON / "asy_src"
TEXER_DIR = COMPARISON / "texer_pngs"
ASY_INTERP = ROOT / "asy-interp.js"
ASY_INTERP_BAK = ROOT / "asy-interp.js.bak"
RENDER_HELPER = ROOT / "render-hitexer.js"
KATEX_CSS = ROOT / "node_modules" / "katex" / "dist" / "katex.min.css"

# ── Selenium setup ───────────────────────────────────────────────

def setup_driver():
    """Create a Chrome WebDriver instance."""
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1200,900")
    options.add_argument("--disable-extensions")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])

    if USE_WDM:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)
    else:
        return webdriver.Chrome(options=options)


# ── SVG -> PNG via Selenium ───────────────────────────────────────

def svg_to_image(driver, svg_string):
    """Convert SVG (possibly with foreignObject KaTeX) to PIL Image via Selenium."""
    # Use file:// URL so KaTeX fonts load correctly from node_modules
    katex_link = ""
    if KATEX_CSS.exists():
        css_uri = KATEX_CSS.as_uri()
        katex_link = f'<link rel="stylesheet" href="{css_uri}">'

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
{katex_link}
<style>
* {{ box-sizing: border-box; }}
body {{ margin: 0; padding: 0; background: white; }}
svg {{ display: block; }}
</style>
</head><body>
{svg_string}
</body></html>"""

    # Write to a temp file inside ROOT so relative paths work
    tmp = ROOT / f"_hitexer_tmp_{os.getpid()}.html"
    try:
        tmp.write_text(html, encoding="utf-8")
        driver.get(tmp.as_uri())
        time.sleep(1.5)  # Wait for KaTeX fonts + render

        try:
            svg_el = driver.find_element(By.TAG_NAME, "svg")
            png_bytes = svg_el.screenshot_as_png
        except Exception:
            png_bytes = driver.get_screenshot_as_png()

        return Image.open(io.BytesIO(png_bytes)).convert("RGB")
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


# ── HiTeXeR rendering ────────────────────────────────────────────

def render_hitexer(asy_path, driver):
    """Render an .asy file via HiTeXeR and return a PIL Image."""
    result = subprocess.run(
        ["node", str(RENDER_HELPER), str(asy_path)],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(f"render-hitexer.js failed: {result.stderr.strip()[:400]}")

    svg_string = result.stdout
    if not svg_string.strip():
        raise RuntimeError("render-hitexer.js returned empty SVG")

    return svg_to_image(driver, svg_string)


# ── Image utilities ──────────────────────────────────────────────

def image_to_base64(img):
    """Convert PIL Image to base64-encoded PNG string."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def image_similarity(img1, img2):
    """Compute simple pixel-level similarity (0-1, higher = more similar)."""
    size = (300, 300)
    a1 = np.array(img1.resize(size, Image.LANCZOS).convert("L"), dtype=float)
    a2 = np.array(img2.resize(size, Image.LANCZOS).convert("L"), dtype=float)
    mse = np.mean((a1 - a2) ** 2)
    return max(0.0, 1.0 - mse / (255.0 ** 2))


# ── Claude Code CLI helper ───────────────────────────────────────

def claude_call(prompt, timeout=120):
    """Call the Claude Code CLI in non-interactive print mode. Returns output text.

    Writes the prompt to a temp file and uses shell redirection
    (claude --print < prompt.txt) so that:
      - Windows can resolve claude.cmd via shell=True
      - The prompt is not limited by command-line length
      - Special characters in the prompt don't need escaping
    """
    prompt_file = ROOT / f"_claude_prompt_{os.getpid()}.txt"
    prompt_file.write_text(prompt, encoding="utf-8")
    try:
        cmd = f'claude --print --output-format text < "{prompt_file}"'
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            cwd=str(ROOT),
        )
    finally:
        prompt_file.unlink(missing_ok=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI failed (exit {result.returncode}): {result.stderr.strip()[:400]}"
        )
    return result.stdout.strip()


# ── Claude helpers ───────────────────────────────────────────────

def eval_model(htx_img, texer_img, asy_code, history):
    """
    Compare HiTeXeR vs TeXeR renders and propose a fix.

    Returns (score: int, description: str, fix_prompt: str|None).
    score >= 8 means good enough.
    """
    history_text = ""
    if history:
        history_text = "\n\nPrevious fix attempts:\n"
        for i, (desc, fp) in enumerate(history):
            history_text += f"\nCycle {i + 1}: {desc}"
            if fp:
                history_text += f"\nFix attempted: {fp[:300]}..."

    # Save images to temp files so Claude Code can read them
    htx_tmp = ROOT / f"_htx_eval_{os.getpid()}.png"
    texer_tmp = ROOT / f"_texer_eval_{os.getpid()}.png"
    htx_img.save(htx_tmp)
    texer_img.save(texer_tmp)

    try:
        prompt = (
            "You are comparing two renders of an Asymptote diagram.\n"
            f"Read the LEFT image (HiTeXeR output): {htx_tmp}\n"
            f"Read the RIGHT image (TeXeR reference): {texer_tmp}\n\n"
            f"Asymptote source:\n```\n{asy_code[:2000]}\n```"
            f"{history_text}\n\n"
            "Describe the visual differences between the two renders. "
            "Then assess quality.\n\n"
            "Return ONLY valid JSON in this exact format:\n"
            '{"score": <0-10>, "description": "<what differs>", '
            '"fix_prompt": "<exact description of what to change in asy-interp.js, or null>"}\n\n'
            "score 10=identical, 8-9=minor differences, 0-4=major problems. "
            "If score>=8 set fix_prompt to null. "
            "If fix_prompt is not null, be specific about which JS function or code path needs changing and how."
        )
        text = claude_call(prompt, timeout=120)
    finally:
        htx_tmp.unlink(missing_ok=True)
        texer_tmp.unlink(missing_ok=True)

    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)

    try:
        data = json.loads(text)
        score = int(data.get("score", 0))
        fix_prompt = data.get("fix_prompt") or None
        description = data.get("description", "")
        if isinstance(fix_prompt, str) and fix_prompt.lower() in ("null", "none", ""):
            fix_prompt = None
        return score, description, fix_prompt
    except (json.JSONDecodeError, ValueError) as e:
        print(f"    Warning: Could not parse eval response: {e}")
        return 0, text[:300], None


def extract_sections(fix_prompt):
    """
    Find relevant sections of asy-interp.js for the given fix description.
    Returns concatenated code sections (~8000 tokens max).
    """
    prompt = (
        f"Given this fix description for asy-interp.js (an Asymptote interpreter):\n\n"
        f"{fix_prompt}\n\n"
        "List the most relevant JavaScript function names or distinctive "
        "identifiers to search for in the source code.\n"
        'Return ONLY a JSON array of strings, e.g. ["drawPath", "computeArrow"]\n'
        "Include 3-8 terms. Prefer specific function names over generic words."
    )
    text = claude_call(prompt, timeout=60)
    m = re.search(r"\[.*?\]", text, re.DOTALL)
    if m:
        try:
            terms = json.loads(m.group(0))
        except json.JSONDecodeError:
            terms = re.findall(r'"([^"]+)"', m.group(0))
    else:
        # Fall back: extract camelCase or snake_case identifiers from fix_prompt
        terms = list(dict.fromkeys(
            re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]{3,})\b', fix_prompt)
        ))[:6]

    if not terms:
        return ""

    lines = ASY_INTERP.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    context = 50

    included = set()
    for term in terms:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        for i, line in enumerate(lines):
            if pattern.search(line):
                for j in range(max(0, i - context), min(total, i + context + 1)):
                    included.add(j)

    if not included:
        return f"// No matches found for: {terms}\n"

    # Group contiguous line numbers into ranges
    sorted_nums = sorted(included)
    ranges = []
    start = prev = sorted_nums[0]
    for n in sorted_nums[1:]:
        if n > prev + 1:
            ranges.append((start, prev))
            start = n
        prev = n
    ranges.append((start, prev))

    parts = []
    for rstart, rend in ranges:
        parts.append(f"\n// Lines {rstart + 1}-{rend + 1}:")
        for i in range(rstart, rend + 1):
            parts.append(f"{i + 1:5d}: {lines[i]}")

    result = "\n".join(parts)
    # Cap at ~32000 chars (~8000 tokens)
    if len(result) > 32000:
        result = result[:32000] + "\n// ... (truncated)"
    return result


def apply_fix(fix_prompt, relevant_sections):
    """
    Use Claude to generate exact code changes and apply them to asy-interp.js.
    Returns (all_applied: bool, applied_changes: list[dict]).
    Writes asy-interp.js only if at least one change was applied.
    """
    excerpt = relevant_sections or "(no specific sections identified)"

    # Embed sections and explicitly forbid reading files — without this instruction
    # Claude Code reads the full 223KB asy-interp.js which takes several minutes.
    prompt = (
        "I need a JSON description of code changes to fix a bug in asy-interp.js.\n"
        "IMPORTANT: Do NOT read any files. Use ONLY the code excerpts provided below.\n\n"
        f"Bug to fix:\n{fix_prompt}\n\n"
        f"Relevant code from asy-interp.js:\n```javascript\n{excerpt}\n```\n\n"
        "Respond with ONLY this JSON structure, no explanation, no prose:\n"
        '{"changes": [{"old_code": "exact string from the code above", "new_code": "replacement string"}]}\n'
        "Requirements: old_code must be an exact verbatim substring of the code shown above "
        "(including all whitespace and indentation). Make minimal targeted changes."
    )
    text = claude_call(prompt, timeout=600)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        print(f"    Warning: no JSON found in fix response (got: {text[:200]!r})")
        return False, []

    raw = m.group(0)
    # Try parsing raw first. Only clean if that fails, since the cleanup
    # regex strips content inside JSON string values that contain "//" sequences.
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: remove trailing commas (Claude sometimes adds these)
        cleaned = re.sub(r',\s*([}\]])', r'\1', raw)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"    Warning: could not parse fix JSON: {e}")
            print(f"    Raw response (first 300 chars): {text[:300]!r}")
            return False, []
    changes = data.get("changes", [])

    if not changes:
        print("    No changes proposed by fix model")
        return False, []

    content = ASY_INTERP.read_text(encoding="utf-8")
    applied = []
    failed = []

    for change in changes:
        old = change.get("old_code", "")
        new = change.get("new_code", "")
        if not old:
            continue

        if old in content:
            content = content.replace(old, new, 1)
            applied.append(change)
            print(f"    Applied: {old[:70].strip()!r}...")
        else:
            # Fuzzy fallback: normalize leading whitespace per line
            def norm_block(s):
                return "\n".join(ln.strip() for ln in s.splitlines())

            old_norm = norm_block(old)
            content_lines = content.splitlines(keepends=True)
            old_lines = old.splitlines()
            matched = False

            if old_lines:
                first_norm = old_lines[0].strip()
                for idx, cline in enumerate(content_lines):
                    if cline.strip() == first_norm and idx + len(old_lines) <= len(content_lines):
                        block = "".join(content_lines[idx: idx + len(old_lines)])
                        if norm_block(block) == old_norm:
                            pos = content.index(block)
                            content = content[:pos] + new + content[pos + len(block):]
                            applied.append(change)
                            matched = True
                            print(f"    Applied (fuzzy): {old[:70].strip()!r}...")
                            break

            if not matched:
                print(f"    FAILED to apply: {old[:80].strip()!r}...")
                failed.append(change)

    if applied:
        ASY_INTERP.write_text(content, encoding="utf-8")

    all_ok = len(failed) == 0 and len(applied) > 0
    return all_ok, applied


# ── Diff utility ─────────────────────────────────────────────────

def compute_diff(original, modified):
    """Return a unified diff (capped at 5000 chars)."""
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    diff = difflib.unified_diff(
        orig_lines, mod_lines,
        fromfile="asy-interp.js",
        tofile="asy-interp.js (modified)",
    )
    return "".join(diff)[:5000]


# ── Diagram selection ────────────────────────────────────────────

def resolve_file_arg(filename):
    """
    Resolve a corpus filename (e.g. 'c95_L6_script_4.asy') to a diagram dict.

    Searches ssim-results.json for a matching corpusFile entry. If not found,
    falls back to asy_corpus/. Returns a dict with at least 'id' and 'corpusFile';
    adds '_asy_path_override' when the file lives outside comparison/asy_src/.
    """
    filename = Path(filename).name  # strip any path prefix, keep bare filename
    if not filename.endswith(".asy"):
        filename += ".asy"

    # Search SSIM results first (gives us the numeric id used for texer_pngs/)
    if SSIM_RESULTS.exists():
        results = json.loads(SSIM_RESULTS.read_text(encoding="utf-8"))
        for r in results:
            if r.get("corpusFile") == filename:
                print(f"Found in ssim-results.json: id={r['id']}  SSIM={r.get('ssim', '?')}")
                return r

    # Fall back: look in asy_corpus/
    corpus_path = ROOT / "asy_corpus" / filename
    if corpus_path.exists():
        stem = Path(filename).stem
        print(f"Not in ssim-results.json -- using asy_corpus/{filename} directly (id={stem})")
        return {"id": stem, "corpusFile": filename, "ssim": None, "_asy_path_override": corpus_path}

    print(f"Error: '{filename}' not found in ssim-results.json or asy_corpus/")
    sys.exit(1)


def ensure_texer_png(driver, diag_id, asy_code):
    """
    Return the path to the TeXeR reference PNG, rendering it first if needed.
    Returns None if rendering fails.
    """
    png_path = TEXER_DIR / f"{diag_id}.png"
    if png_path.exists():
        return png_path

    print(f"    TeXeR PNG not found -- rendering via AoPS TeXeR (this may take ~30s)...")
    TEXER_DIR.mkdir(parents=True, exist_ok=True)

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "fetch_texer_renders", ROOT / "fetch-texer-renders.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    success = mod.render_on_texer(driver, asy_code, png_path)
    if success:
        print(f"    TeXeR PNG saved -> {png_path}")
        return png_path
    else:
        print("    TeXeR render failed")
        return None


def select_diagrams(count):
    """Pick the worst-SSIM diagrams that have both .asy source and TeXeR PNG."""
    if not SSIM_RESULTS.exists():
        print(f"Error: {SSIM_RESULTS} not found. Run the SSIM pipeline first.")
        sys.exit(1)

    results = json.loads(SSIM_RESULTS.read_text(encoding="utf-8"))
    selected = []
    for r in results:
        diag_id = r.get("id", "")
        if not diag_id:
            continue
        if (TEXER_DIR / f"{diag_id}.png").exists() and (ASY_SRC_DIR / f"{diag_id}.asy").exists():
            selected.append(r)
            if len(selected) >= count:
                break

    if not selected:
        print("No diagrams found with both .asy source and TeXeR reference PNG.")
        print(f"  Looked in: {TEXER_DIR}  and  {ASY_SRC_DIR}")
        sys.exit(1)

    print(f"Selected {len(selected)} diagram(s) (worst SSIM first):")
    for r in selected:
        print(f"  {r['id']}  SSIM={r.get('ssim', 0):.3f}  file={r.get('corpusFile', '')}")
    return selected


# ── HTML report ──────────────────────────────────────────────────

def img_tag(img, max_w=380):
    """Render a PIL Image as an inline <img> tag, or a placeholder if None."""
    if img is None:
        return '<div style="color:#aaa;padding:20px;border:1px dashed #ccc">No image</div>'
    b64 = image_to_base64(img)
    return (
        f'<img src="data:image/png;base64,{b64}" '
        f'style="max-width:{max_w}px;border:1px solid #ddd;display:block">'
    )


def generate_report(log, output_path):
    """Generate a self-contained HTML report from the improvement log."""
    sections = []

    for entry in log:
        diag_id = entry["id"]
        cycles_data = entry["cycles"]
        final_score = entry.get("final_score", 0)

        score_color = (
            "#4caf50" if final_score >= 8 else
            "#ff9800" if final_score >= 5 else
            "#f44336"
        )

        cycles_html_parts = []
        for c in cycles_data:
            cycle_num = c["cycle"]
            score = c.get("score", "?")
            description = c.get("description", "")
            fix_prompt = c.get("fix_prompt") or ""
            changes = c.get("changes", [])
            restored = c.get("restored", False)
            diff_text = c.get("diff", "")

            changes_html = ""
            if changes:
                items = "".join(
                    f'<li><code style="font-size:11px">{ch.get("old_code","")[:100].strip()}...</code></li>'
                    for ch in changes
                )
                changes_html = f'<b>Changes applied:</b><ul style="margin:4px 0">{items}</ul>'

            diff_html = ""
            if diff_text:
                diff_esc = diff_text.replace("&", "&amp;").replace("<", "&lt;")
                diff_html = (
                    '<details><summary style="cursor:pointer;color:#555">Show diff</summary>'
                    f'<pre style="font-size:10px;overflow-x:auto;background:#f5f5f5;padding:8px">{diff_esc}</pre>'
                    "</details>"
                )

            fix_html = ""
            if fix_prompt:
                fix_esc = fix_prompt.replace("&", "&amp;").replace("<", "&lt;")
                fix_html = (
                    '<div style="margin-top:6px"><b>Fix prompt:</b>'
                    f'<pre style="font-size:11px;white-space:pre-wrap;background:#fffbe6;padding:6px;border-radius:3px">{fix_esc}</pre></div>'
                )

            restored_html = ""
            if restored:
                restored_html = '<div style="color:#c62828;font-weight:bold;margin-top:6px">⚠ Backup restored (change was harmful)</div>'

            texer_html = img_tag(c.get("texer_img"))
            htx_html = img_tag(c.get("htx_img"))

            cycles_html_parts.append(f"""
<div style="border:1px solid #ccc;border-radius:4px;padding:12px;margin:8px 0;background:#fafafa">
  <div style="font-weight:bold;margin-bottom:8px">Cycle {cycle_num} &mdash; Score: {score}/10</div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">
    <div>
      <div style="font-size:11px;color:#666;margin-bottom:4px">HiTeXeR (before fix)</div>
      {htx_html}
    </div>
    <div>
      <div style="font-size:11px;color:#666;margin-bottom:4px">TeXeR reference</div>
      {texer_html}
    </div>
  </div>
  <div><b>Description:</b> {description}</div>
  {fix_html}
  {changes_html}
  {diff_html}
  {restored_html}
</div>""")

        final_img_html = ""
        if entry.get("final_img"):
            final_img_html = f"""
<div style="margin-top:12px">
  <b>Final HiTeXeR render after all cycles:</b><br>
  {img_tag(entry['final_img'])}
</div>"""

        sections.append(f"""
<div style="border:2px solid #ddd;border-radius:6px;padding:16px;margin:20px 0">
  <h2 style="margin:0 0 8px 0">
    Diagram {diag_id}
    <span style="font-size:14px;font-weight:normal;color:{score_color};margin-left:10px">
      Final score: {final_score}/10
    </span>
  </h2>
  <div style="font-size:12px;color:#666;margin-bottom:12px">
    File: {entry.get('asy_file', diag_id + '.asy')} &nbsp;|&nbsp; Cycles run: {len(cycles_data)}
  </div>
  {"".join(cycles_html_parts)}
  {final_img_html}
</div>""")

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>HiTeXeR Improvement Report &mdash; {timestamp}</title>
<style>
body {{
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  max-width: 1200px; margin: 0 auto; padding: 20px; color: #333;
}}
h1 {{ color: #1a1a1a; margin-bottom: 4px; }}
code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; }}
pre {{ background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }}
</style>
</head>
<body>
<h1>HiTeXeR Automated Improvement Report</h1>
<p style="color:#666">Generated: {timestamp} &nbsp;|&nbsp; Diagrams processed: {len(log)}</p>
{"".join(sections)}
</body>
</html>"""

    Path(output_path).write_text(html, encoding="utf-8")


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HiTeXeR automated improvement loop")
    parser.add_argument("--diagrams", type=int, default=3,
                        help="Number of diagrams to process (worst SSIM first)")
    parser.add_argument("--max-cycles", type=int, default=5,
                        help="Max fix cycles per diagram")
    parser.add_argument("--output-dir", default=".",
                        help="Directory for report and log files")
    parser.add_argument("--file", metavar="FILENAME",
                        help="Target a specific diagram, e.g. c95_L6_script_4.asy")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.file:
        diagrams = [resolve_file_arg(args.file)]
    else:
        diagrams = select_diagrams(args.diagrams)

    print("\nSetting up Chrome WebDriver...")
    driver = setup_driver()

    full_log = []

    try:
        for diag_idx, diag in enumerate(diagrams):
            diag_id = diag["id"]
            asy_path = diag.get("_asy_path_override") or ASY_SRC_DIR / f"{diag_id}.asy"
            asy_code = Path(asy_path).read_text(encoding="utf-8")

            ssim_str = f"SSIM={diag['ssim']:.3f}" if diag.get("ssim") is not None else "SSIM=n/a"
            print(f"\n{'=' * 60}")
            print(f"Diagram {diag_idx + 1}/{len(diagrams)}: {diag_id}  "
                  f"{ssim_str}  file={diag.get('corpusFile', '')}")
            print("=" * 60)

            texer_png_path = ensure_texer_png(driver, diag_id, asy_code)
            if texer_png_path is None:
                print("  Skipping -- could not obtain TeXeR reference PNG.")
                continue
            texer_img = Image.open(texer_png_path).convert("RGB")

            entry = {
                "id": diag_id,
                "asy_file": diag.get("corpusFile") or f"{diag_id}.asy",
                "cycles": [],
                "final_score": 0,
                "final_img": None,
            }
            history = []

            for cycle in range(1, args.max_cycles + 1):
                print(f"\n  Cycle {cycle}/{args.max_cycles}")

                # Render current HiTeXeR output
                try:
                    htx_img = render_hitexer(asy_path, driver)
                    print(f"    HiTeXeR render OK  size={htx_img.size}")
                except Exception as e:
                    print(f"    HiTeXeR render FAILED: {e}")
                    break

                # Evaluate with Claude
                print("    Calling eval model...")
                score, description, fix_prompt = eval_model(
                    htx_img, texer_img, asy_code, history
                )
                print(f"    Score: {score}/10")
                print(f"    Description: {description[:120]}")

                cycle_data = {
                    "cycle": cycle,
                    "score": score,
                    "description": description,
                    "fix_prompt": fix_prompt,
                    "htx_img": htx_img,
                    "texer_img": texer_img,
                    "changes": [],
                    "restored": False,
                    "diff": "",
                }
                entry["cycles"].append(cycle_data)
                entry["final_score"] = score
                entry["final_img"] = htx_img
                history.append((description, fix_prompt))

                if score >= 8 or fix_prompt is None:
                    print(f"    Score {score} >= 8 or no fix needed -- stopping.")
                    break

                # Extract relevant code sections
                print("    Extracting relevant sections from asy-interp.js...")
                relevant_sections = extract_sections(fix_prompt)

                # Backup before modifying
                original_content = ASY_INTERP.read_text(encoding="utf-8")
                shutil.copy2(ASY_INTERP, ASY_INTERP_BAK)
                print("    Backup saved -> asy-interp.js.bak")

                # Apply fix
                print("    Calling fix model...")
                all_ok, applied_changes = apply_fix(fix_prompt, relevant_sections)
                cycle_data["changes"] = applied_changes

                if not applied_changes:
                    print("    No changes applied -- restoring backup.")
                    shutil.copy2(ASY_INTERP_BAK, ASY_INTERP)
                    cycle_data["restored"] = True
                    break

                # Capture diff
                modified_content = ASY_INTERP.read_text(encoding="utf-8")
                cycle_data["diff"] = compute_diff(original_content, modified_content)

                # Verify fix didn't make things worse
                try:
                    new_htx_img = render_hitexer(asy_path, driver)
                    new_sim = image_similarity(new_htx_img, texer_img)
                    old_sim = image_similarity(htx_img, texer_img)
                    print(f"    Similarity vs TeXeR: {old_sim:.3f} -> {new_sim:.3f}")

                    if new_sim < old_sim - 0.05:
                        print("    Fix made rendering worse -- restoring backup.")
                        shutil.copy2(ASY_INTERP_BAK, ASY_INTERP)
                        cycle_data["restored"] = True
                        break

                    print("    Fix accepted.")
                    entry["final_img"] = new_htx_img

                except Exception as e:
                    print(f"    Post-fix render failed ({e}) -- restoring backup.")
                    shutil.copy2(ASY_INTERP_BAK, ASY_INTERP)
                    cycle_data["restored"] = True
                    break

            full_log.append(entry)

            # Save incremental log (no PIL Images)
            log_path = output_dir / "hitexer-improve-log.json"
            json_log = []
            for e in full_log:
                je = {k: v for k, v in e.items() if k not in ("final_img",)}
                je["cycles"] = []
                for c in e["cycles"]:
                    jc = {k: v for k, v in c.items() if k not in ("htx_img", "texer_img")}
                    je["cycles"].append(jc)
                json_log.append(je)
            log_path.write_text(json.dumps(json_log, indent=2), encoding="utf-8")
            print(f"\n  Log saved -> {log_path}")

    finally:
        driver.quit()
        print("\nChrome WebDriver closed.")

    # Generate HTML report
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = output_dir / f"hitexer-improve-report-{ts}.html"
    print(f"\nGenerating HTML report -> {report_path}")
    generate_report(full_log, report_path)

    print("Opening report in browser...")
    webbrowser.open(report_path.as_uri())

    print(f"\nDone.")
    print(f"  Log:    {output_dir / 'hitexer-improve-log.json'}")
    print(f"  Report: {report_path}")


if __name__ == "__main__":
    main()
