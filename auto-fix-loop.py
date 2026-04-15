#!/usr/bin/env python3
"""
Automated HiTeXeR fix loop.

Picks a random diagram from the corpus, compares HiTeXeR vs Asymptote renders,
uses Claude Sonnet to identify the biggest difference, then Claude Opus to
fix asy-interp.js.  Loops until Sonnet says there are no major discrepancies,
then checks overall image size and loops again if needed.

Maintains a live-updating HTML progress page.

Usage:
    python auto-fix-loop.py
    python auto-fix-loop.py --count 10        # process 10 diagrams then stop
    python auto-fix-loop.py --id 01333        # start with a specific diagram
"""

import argparse
import base64
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import webbrowser
from datetime import datetime
from pathlib import Path

try:
    import requests as _requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow required. Run: pip install Pillow")
    sys.exit(1)

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.chrome.service import Service
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        _USE_WDM = True
    except ImportError:
        _USE_WDM = False
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False

# ── Paths ────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
COMPARISON = ROOT / "comparison"
SSIM_RESULTS = COMPARISON / "ssim-results.json"
ASY_SRC_DIR = COMPARISON / "asy_src"
TEXER_DIR = COMPARISON / "asy_pngs"
ASY_INTERP = ROOT / "asy-interp.js"
RENDER_HELPER = ROOT / "render-hitexer.js"
REPORT_PATH = ROOT / "auto-fix-report.html"
TEXER_URL = "https://artofproblemsolving.com/texer/"
HITEXER_URL = "http://localhost:8080/"

# ── Selenium / AoPS TeXeR helpers ───────────────────────────────

def _dismiss_aops_modals(driver):
    """Dismiss any AoPS modal overlays."""
    try:
        driver.execute_script("""
            document.querySelectorAll('.aops-modal-wrapper').forEach(function(el) {
                var btn = el.querySelector('.aops-modal-btn, button');
                if (btn) btn.click();
            });
            document.querySelectorAll(
                '.aops-modal-wrapper, .aops-modal-overlay, .modal-backdrop'
            ).forEach(function(el) { el.style.display = 'none'; });
        """)
    except Exception:
        pass


def setup_texer_driver():
    """Create a Chrome WebDriver and navigate to AoPS TeXeR."""
    if not HAS_SELENIUM:
        return None
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1400,900")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    if _USE_WDM:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    else:
        driver = webdriver.Chrome(options=options)
    driver.get(TEXER_URL)
    time.sleep(5)  # give page time to settle
    _dismiss_aops_modals(driver)
    # Wait for CodeMirror (up to 20s), but don't fail hard if it times out
    try:
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )
    except Exception:
        print("  Warning: CodeMirror not detected — TeXeR may not be ready")
    _dismiss_aops_modals(driver)
    return driver


def render_on_texer(driver, asy_code, output_path, timeout=90):
    """Render Asymptote code on AoPS TeXeR and save the PNG. Returns True on success.

    Downloads the actual PNG from the image URL (so pixel dimensions match what
    the TeXeR server generates, not the CSS-scaled browser display).
    """
    _dismiss_aops_modals(driver)
    # Remove any stale image from #preview
    driver.execute_script("""
        var preview = document.getElementById('preview');
        if (preview) {
            preview.querySelectorAll('img').forEach(function(img) { img.remove(); });
        }
    """)
    # Set code in CodeMirror
    wrapped = f"[asy]\n{asy_code}\n[/asy]"
    cm_set = driver.execute_script("""
        var cm = document.querySelector('.CodeMirror');
        if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(arguments[0]); return true; }
        return false;
    """, wrapped)
    if not cm_set:
        print("    Warning: CodeMirror setValue failed, trying textarea fallback")
        driver.execute_script("""
            var ta = document.getElementById('boomer') || document.querySelector('textarea');
            if (ta) { ta.value = arguments[0]; ta.dispatchEvent(new Event('input', {bubbles:true})); }
        """, wrapped)
    time.sleep(0.5)
    # Dismiss any modals before clicking render
    _dismiss_aops_modals(driver)
    # Click render
    try:
        btn = driver.find_element(By.CSS_SELECTOR, "#render-image")
        btn.click()
        print(f"    Clicked render button, waiting up to {timeout}s...")
    except Exception as e:
        print(f"    Could not click #render-image: {e}")
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.common.action_chains import ActionChains
        ActionChains(driver).send_keys(Keys.CONTROL + Keys.RETURN).perform()
    # Wait for new image to load
    try:
        WebDriverWait(driver, timeout).until(lambda d: d.execute_script("""
            var img = document.querySelector('#preview img');
            return img && img.src && img.complete && img.naturalWidth > 0;
        """))
        # Get the image src URL and natural dims
        img_info = driver.execute_script("""
            var img = document.querySelector('#preview img');
            if (!img) return null;
            return {src: img.src, w: img.naturalWidth, h: img.naturalHeight};
        """)
        if not img_info:
            raise RuntimeError("No img element found after wait")

        img_src = img_info.get('src', '')
        natural_w = img_info.get('w', 0)
        natural_h = img_info.get('h', 0)

        # Try to download the actual PNG from the server URL (correct pixel dimensions)
        downloaded = False
        if img_src and HAS_REQUESTS:
            try:
                resp = _requests.get(img_src, timeout=15)
                if resp.status_code == 200 and len(resp.content) > 100:
                    output_path.write_bytes(resp.content)
                    downloaded = True
                    # Read actual PNG dimensions from downloaded file
                    from PIL import Image as _PIL_Image
                    with _PIL_Image.open(output_path) as _img:
                        natural_w, natural_h = _img.size
                    print(f"    Got TeXeR image (URL): {output_path.name} ({natural_w}x{natural_h} px)")
            except Exception as dl_err:
                print(f"    URL download failed ({dl_err}), falling back to element screenshot")

        if not downloaded:
            # Fallback: element screenshot (CSS-scaled, dimensions may not match server PNG)
            img_el = driver.find_element(By.CSS_SELECTOR, "#preview img")
            img_el.screenshot(str(output_path))
            print(f"    Got TeXeR image (screenshot): {output_path.name} ({natural_w}x{natural_h} natural px)")

        # Save dims sidecar JSON for the size fix loop
        dims_path = output_path.with_suffix(".json")
        dims_path.write_text(json.dumps({"w": natural_w, "h": natural_h}), encoding="utf-8")
        return True
    except Exception as e:
        print(f"    TeXeR image wait failed: {e}")
        try:
            driver.find_element(By.CSS_SELECTOR, "#preview").screenshot(str(output_path))
            return True
        except Exception:
            return False

# ── SVG to PNG via sharp (node) ──────────────────────────────────

RASTERIZE_JS = r"""
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgFile = process.argv[2];
const outFile = process.argv[3];
const dpi = parseInt(process.argv[4] || '144', 10);

const svgBuf = fs.readFileSync(svgFile);

// Embed KaTeX fonts as base64 so sharp/librsvg can render them
let svgStr = svgBuf.toString('utf8');

// Find KaTeX font references and embed them
const katexFontDir = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');
if (fs.existsSync(katexFontDir)) {
    svgStr = svgStr.replace(
        /url\(["']?([^"')]*\.woff2?)["']?\)/g,
        (match, url) => {
            // Extract font filename from URL
            const fontName = path.basename(url.split('?')[0].split('#')[0]);
            const fontPath = path.join(katexFontDir, fontName);
            if (fs.existsSync(fontPath)) {
                const b64 = fs.readFileSync(fontPath).toString('base64');
                const ext = fontName.endsWith('.woff2') ? 'woff2' : 'woff';
                return `url("data:font/${ext};base64,${b64}")`;
            }
            return match;
        }
    );
}

sharp(Buffer.from(svgStr), { density: dpi })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toFile(outFile)
    .then(() => {
        // Output the image dimensions
        return sharp(outFile).metadata();
    })
    .then(meta => {
        process.stdout.write(JSON.stringify({ width: meta.width, height: meta.height }));
    })
    .catch(err => {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    });
"""


def render_hitexer_png(asy_path, out_png_path, dpi=144):
    """Render an .asy file via HiTeXeR -> SVG -> PNG.

    Returns (png_width, png_height, intrinsic_w, intrinsic_h).
    intrinsic_w/h are the SVG display dimensions BEFORE any container shrink
    (data-intrinsic-w/h attributes), representing what the user would see in
    a full-size browser preview.  These are in CSS px = bp (at bpToCSSPx scale).
    """
    # Step 1: render to SVG
    result = subprocess.run(
        ["node", str(RENDER_HELPER), str(asy_path)],
        capture_output=True, text=True, encoding='utf-8', timeout=30, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(f"render-hitexer.js failed: {result.stderr.strip()[:400]}")
    svg_string = result.stdout
    if not svg_string.strip():
        raise RuntimeError("render-hitexer.js returned empty SVG")

    # Extract intrinsic (pre-shrink) SVG dimensions from data-intrinsic-w/h attributes
    intrinsic_w, intrinsic_h = None, None
    m_w = re.search(r'data-intrinsic-w="([^"]+)"', svg_string)
    m_h = re.search(r'data-intrinsic-h="([^"]+)"', svg_string)
    if m_w and m_h:
        try:
            intrinsic_w = float(m_w.group(1))
            intrinsic_h = float(m_h.group(1))
        except ValueError:
            pass

    # Step 2: write SVG to temp file
    svg_tmp = ROOT / f"_autofix_tmp_{os.getpid()}.svg"
    svg_tmp.write_text(svg_string, encoding="utf-8")

    # Step 3: rasterize via sharp
    rast_script = ROOT / f"_autofix_rasterize_{os.getpid()}.js"
    rast_script.write_text(RASTERIZE_JS, encoding="utf-8")
    try:
        result = subprocess.run(
            ["node", str(rast_script), str(svg_tmp), str(out_png_path), str(dpi)],
            capture_output=True, text=True, encoding='utf-8', timeout=30, cwd=str(ROOT),
        )
        if result.returncode != 0:
            raise RuntimeError(f"Rasterize failed: {result.stderr.strip()[:400]}")
        meta = json.loads(result.stdout)
        return meta["width"], meta["height"], intrinsic_w, intrinsic_h
    finally:
        svg_tmp.unlink(missing_ok=True)
        rast_script.unlink(missing_ok=True)


# ── Image helpers ────────────────────────────────────────────────

def image_to_base64(path_or_pil):
    """Convert a file path or PIL Image to base64 PNG string."""
    if isinstance(path_or_pil, (str, Path)):
        data = Path(path_or_pil).read_bytes()
    else:
        buf = io.BytesIO()
        path_or_pil.save(buf, format="PNG")
        data = buf.getvalue()
    return base64.b64encode(data).decode("ascii")


def get_image_size(png_path):
    """Return (width, height) of a PNG file."""
    img = Image.open(png_path)
    return img.size


# ── Diagram selection ────────────────────────────────────────────

def load_eligible_diagrams():
    """Load diagrams that have an .asy source file (PNG rendered on demand)."""
    if not SSIM_RESULTS.exists():
        print(f"Error: {SSIM_RESULTS} not found.")
        sys.exit(1)

    results = json.loads(SSIM_RESULTS.read_text(encoding="utf-8"))
    eligible = []
    for r in results:
        diag_id = r.get("id", "")
        if not diag_id:
            continue
        if (ASY_SRC_DIR / f"{diag_id}.asy").exists():
            eligible.append(r)
    return eligible


def get_reference_png(diag_id, texer_driver=None):
    """Return path to reference PNG via AoPS TeXeR (cached in asy_pngs/).

    Only uses the cache if a sidecar .json exists (indicating the PNG was
    downloaded from the AoPS TeXeR server URL, not taken as a CSS element
    screenshot which would give incorrect dimensions).
    """
    png_path = TEXER_DIR / f"{diag_id}.png"
    json_path = png_path.with_suffix(".json")
    if png_path.exists() and json_path.exists():
        return png_path
    # If PNG exists without sidecar JSON, it's from an old element-screenshot
    # run — delete it so we re-fetch the correct server PNG.
    if png_path.exists():
        png_path.unlink(missing_ok=True)
        print(f"    Deleted stale cached PNG (no sidecar JSON): {png_path.name}")
    if texer_driver is None:
        raise RuntimeError("No TeXeR driver available and PNG not cached")
    asy_path = ASY_SRC_DIR / f"{diag_id}.asy"
    asy_code = asy_path.read_text(encoding="utf-8")
    print(f"    Fetching reference from AoPS TeXeR...")
    success = render_on_texer(texer_driver, asy_code, png_path)
    if not success or not png_path.exists():
        raise RuntimeError("TeXeR render failed")
    return png_path


# ── Claude CLI helpers ───────────────────────────────────────────

def claude_sonnet_compare(htx_png_path, texer_png_path, asy_code):
    """
    Call Claude Sonnet to identify the single most significant difference.
    Returns (has_issues: bool, description: str).
    """
    prompt_text = f"""Read the image files {htx_png_path} and {texer_png_path} .

You are comparing two renders of an Asymptote diagram.

The first image ({htx_png_path}) is the HiAsymptote render (our JavaScript implementation).
The second image ({texer_png_path}) is the Asymptote render (the reference/ground truth).

Asymptote source code:
```
{asy_code[:3000]}
```

Compare the two images and identify any significant differences that would be noticeable to most human users. Look for:
- Elements missing from HiTeXeR
- Extra elements added to HiTeXeR that shouldn't be there
- Elements overlapping differently between the two versions
- Colors missing or different
- Labels significantly the wrong size, placed wrong, or significantly different font
- Styles (dotted vs dashed vs solid, line thickness) significantly different
- HiTeXeR simply not rendering (blank or error)

If there are significant differences, pick out the SINGLE most significant difference and explain it clearly.

Respond with ONLY valid JSON in this exact format:
{{"has_issues": true/false, "description": "description of the single most significant difference, or 'No major discrepancies' if none"}}

If the images look essentially the same to a human viewer (minor pixel-level differences don't count), set has_issues to false.
"""

    prompt_file = ROOT / f"_autofix_sonnet_prompt_{os.getpid()}.txt"
    prompt_file.write_text(prompt_text, encoding="utf-8")

    try:
        cmd = (
            f'claude --print --output-format text '
            f'--model claude-sonnet-4-20250514 '
            f'--dangerously-skip-permissions '
            f'< "{prompt_file}"'
        )
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            encoding="utf-8", timeout=180, cwd=str(ROOT),
        )
    finally:
        prompt_file.unlink(missing_ok=True)

    if result.returncode != 0:
        print(f"    Sonnet CLI failed (exit {result.returncode}): {result.stderr.strip()[:300]}")
        return True, f"CLI error: {result.stderr.strip()[:200]}"

    text = result.stdout.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            return data.get("has_issues", True), data.get("description", text[:300])
        except json.JSONDecodeError:
            pass
    return True, text[:300]


def claude_opus_fix(htx_png_path, texer_png_path, asy_code, issue_description, diag_id):
    """
    Call Claude Opus to fix the identified issue in asy-interp.js.
    Returns the stdout from Opus.
    """
    asy_path = ASY_SRC_DIR / f"{diag_id}.asy"

    prompt_text = f"""You are fixing a rendering bug in asy-interp.js, a JavaScript Asymptote interpreter.

I'm showing you two renders of the same Asymptote diagram:
- First image: HiAsymptote render (our JS implementation) at {htx_png_path}
- Second image: Asymptote render (the reference/ground truth) at {texer_png_path}

The Asymptote source code is at {asy_path}

The identified issue is:
{issue_description}

Your task:
1. Read the two images and the Asymptote source code to understand the problem.
2. Read the relevant parts of asy-interp.js to find the code responsible for the bug.
3. Fix the bug in asy-interp.js with minimal, targeted changes.
4. After making your fix, verify it by running: node render-hitexer.js {asy_path}
   This should produce valid SVG output. Check that it runs without errors.
5. Do NOT break other diagrams - make the minimal change needed.

IMPORTANT: The file asy-interp.js is very large (~400KB). Search for specific function names
or keywords related to the issue rather than reading the whole file.

IMPORTANT: After editing asy-interp.js, bump the version number in index.html (search for
the `v` string in the `<h1>` header) so we can confirm the change.
"""

    prompt_file = ROOT / f"_autofix_opus_prompt_{os.getpid()}.txt"
    prompt_file.write_text(prompt_text, encoding="utf-8")

    try:
        # Use stdin to pass the prompt, NOT --print/-p, so Claude runs in
        # agentic mode and can use tools (Read, Edit, Bash) to fix the code.
        cmd = (
            f'claude --dangerously-skip-permissions '
            f'--model claude-opus-4-20250514 '
            f'--output-format text '
            f'--max-turns 30 '
            f'< "{prompt_file}"'
        )
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            encoding="utf-8", timeout=900, cwd=str(ROOT),
        )
    finally:
        prompt_file.unlink(missing_ok=True)

    if result.returncode != 0:
        print(f"    Opus CLI failed (exit {result.returncode}): {result.stderr.strip()[:300]}")
        return f"CLI error: {result.stderr.strip()[:200]}"

    return result.stdout.strip()


def claude_opus_fix_size(htx_png_path, texer_png_path, htx_size, texer_size, diag_id):
    """
    Call Claude Opus to fix overall size discrepancy.
    htx_size: HiTeXeR intrinsic (pre-shrink) CSS pixel dimensions.
    texer_size: AoPS TeXeR natural PNG pixel dimensions.
    """
    asy_path = ASY_SRC_DIR / f"{diag_id}.asy"

    w_ratio = htx_size[0] / texer_size[0] if texer_size[0] else 1.0
    h_ratio = htx_size[1] / texer_size[1] if texer_size[1] else 1.0
    w_err = abs(w_ratio - 1.0)
    h_err = abs(h_ratio - 1.0)
    direction = "LARGER" if w_ratio > 1.0 else "SMALLER"

    prompt_text = f"""You are fixing a SIZE discrepancy in asy-interp.js, a JavaScript Asymptote interpreter.

GOAL: When the same Asymptote code is rendered by HiTeXeR and by the AoPS TeXeR website, the
diagrams should appear at the same physical size in a browser (1 CSS px = 1 CSS px on screen).

Two renders of the same Asymptote diagram ({diag_id}):
- HiTeXeR PNG (may be shrunk by preview container): {htx_png_path}
- AoPS TeXeR PNG (reference/ground truth): {texer_png_path}  ({texer_size[0]}x{texer_size[1]} px)

Key comparison — at 144 DPI (AoPS TeXeR and HiTeXeR rasterize at the same density):
  HiTeXeR projected 144-DPI px: {htx_size[0]}x{htx_size[1]} px
  AoPS TeXeR PNG:                {texer_size[0]}x{texer_size[1]} px

Ratio HiTeXeR/TeXeR: width={w_ratio:.3f}  height={h_ratio:.3f}  (target: 1.0)
HiTeXeR is {w_err*100:.1f}% {direction} than TeXeR in width, {h_err*100:.1f}% in height.

The Asymptote source is at {asy_path}

IMPORTANT CONTEXT:
- In asy-interp.js the key scale factor is `bpToCSSPx` (around line 7778) which converts
  Asymptote big-points to CSS pixels in the SVG.  Currently it is set to `120/72` (~1.667).
- AoPS TeXeR renders PNGs at ~144 DPI (2x Retina): px ≈ bp * (144/72).
- HiTeXeR also rasterizes at 144 DPI via sharp: htx_px = bp * bpToCSSPx * (144/72).
- For sizes to match: bpToCSSPx should equal 1.0 (so htx_px = bp × 2 = texer_px).
- If bpToCSSPx = 120/72 ≈ 1.667, then htx_px = texer_px × 1.667 — {direction.upper()}.
- bpToCSSPx is {"too HIGH" if w_ratio > 1.0 else "too LOW"} and needs to be adjusted.

To fix: change `bpToCSSPx` in asy-interp.js so projected px matches TeXeR px.
- Required factor: multiply bpToCSSPx by {1.0/w_ratio:.4f}
  → new bpToCSSPx ≈ {(120/72)/w_ratio:.4f}  (currently 120/72 ≈ 1.6667)
- This is a global change affecting ALL diagrams proportionally — correct and intentional.

Steps:
1. Find `bpToCSSPx` in asy-interp.js and update its value as described above
2. Verify with: node render-hitexer.js {asy_path}
3. Confirm the output SVG's data-intrinsic-w × 2 is now closer to {texer_size[0]} px

IMPORTANT: After editing asy-interp.js, bump the version number in index.html.
"""

    prompt_file = ROOT / f"_autofix_opus_size_prompt_{os.getpid()}.txt"
    prompt_file.write_text(prompt_text, encoding="utf-8")

    try:
        cmd = (
            f'claude --dangerously-skip-permissions '
            f'--model claude-opus-4-20250514 '
            f'--output-format text '
            f'--max-turns 30 '
            f'< "{prompt_file}"'
        )
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            encoding="utf-8", timeout=900, cwd=str(ROOT),
        )
    finally:
        prompt_file.unlink(missing_ok=True)

    return result.stdout.strip() if result.returncode == 0 else ""


# ── Live HTML report ─────────────────────────────────────────────

class LiveReport:
    """Maintains a live-updating HTML report file."""

    def __init__(self, path):
        self.path = Path(path)
        self.diagrams = []  # list of diagram records
        self._write()

    def add_diagram(self, diag_id, corpus_file, comparator_idx, asy_code=""):
        """Start tracking a new diagram."""
        rec = {
            "id": diag_id,
            "corpus_file": corpus_file,
            "comparator_idx": comparator_idx,
            "asy_code": asy_code,
            "texer_b64": None,
            "htx_before_b64": None,
            "htx_after_b64": None,
            "cycles": [],
            "size_cycles": [],
            "status": "in_progress",
            "issue_log": [],
        }
        self.diagrams.append(rec)
        self._write()
        return rec

    def set_texer_image(self, rec, png_path):
        rec["texer_b64"] = image_to_base64(png_path)
        self._write()

    def set_htx_before(self, rec, png_path):
        rec["htx_before_b64"] = image_to_base64(png_path)
        self._write()

    def set_htx_after(self, rec, png_path):
        rec["htx_after_b64"] = image_to_base64(png_path)
        self._write()

    def add_cycle(self, rec, cycle_num, issue_desc, opus_summary=""):
        rec["cycles"].append({
            "cycle": cycle_num,
            "issue": issue_desc,
            "opus_summary": opus_summary[:500],
        })
        rec["issue_log"].append(issue_desc)
        self._write()

    def add_size_cycle(self, rec, cycle_num, htx_size, texer_natural,
                       htx_pt=None, texer_pt=None):
        w_ratio = htx_size[0] / texer_natural[0] if texer_natural[0] else None
        h_ratio = htx_size[1] / texer_natural[1] if texer_natural[1] else None
        w_err = abs(w_ratio - 1.0) if w_ratio is not None else None
        h_err = abs(h_ratio - 1.0) if h_ratio is not None else None
        rec["size_cycles"].append({
            "cycle": cycle_num,
            "htx_size": f"{htx_size[0]}x{htx_size[1]}",
            "texer_size": f"{texer_natural[0]}x{texer_natural[1]}",
            "w_ratio": f"{w_ratio:.3f}" if w_ratio is not None else "",
            "h_ratio": f"{h_ratio:.3f}" if h_ratio is not None else "",
            "w_err": f"{w_err*100:.1f}%" if w_err is not None else "",
            "h_err": f"{h_err*100:.1f}%" if h_err is not None else "",
        })
        self._write()

    def mark_done(self, rec, status="done"):
        rec["status"] = status
        self._write()

    def _img_tag(self, b64, label):
        if not b64:
            return f'<div class="placeholder">{label}: pending...</div>'
        return (
            f'<div class="img-col">'
            f'<div class="img-label">{label}</div>'
            f'<img src="data:image/png;base64,{b64}">'
            f'</div>'
        )

    def _write(self):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sections = []

        for i, rec in enumerate(self.diagrams):
            status_class = "done" if rec["status"] == "done" else "active"
            status_badge = (
                '<span class="badge done">Done</span>' if rec["status"] == "done"
                else '<span class="badge active">In Progress</span>' if rec["status"] == "in_progress"
                else f'<span class="badge error">{rec["status"]}</span>'
            )

            images_html = f"""
            <div class="images-row">
                {self._img_tag(rec['texer_b64'], 'Asymptote (reference)')}
                {self._img_tag(rec['htx_before_b64'], 'HiTeXeR BEFORE')}
                {self._img_tag(rec['htx_after_b64'], 'HiTeXeR AFTER')}
            </div>"""

            cycles_html = ""
            if rec["cycles"]:
                rows = []
                for c in rec["cycles"]:
                    issue_esc = c["issue"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    rows.append(
                        f'<tr><td>{c["cycle"]}</td>'
                        f'<td>{issue_esc}</td></tr>'
                    )
                cycles_html = f"""
                <div class="cycles-section">
                    <h4>Visual Fix Cycles</h4>
                    <table>
                        <tr><th>#</th><th>Issue Identified by Sonnet</th></tr>
                        {"".join(rows)}
                    </table>
                </div>"""

            size_html = ""
            if rec["size_cycles"]:
                rows = []
                for sc in rec["size_cycles"]:
                    rows.append(
                        f'<tr><td>{sc["cycle"]}</td>'
                        f'<td>{sc["htx_size"]} px</td>'
                        f'<td>{sc["texer_size"]} px</td>'
                        f'<td>{sc.get("w_ratio","")}</td>'
                        f'<td>{sc.get("h_ratio","")}</td>'
                        f'<td>{sc.get("w_err","")}</td>'
                        f'<td>{sc.get("h_err","")}</td></tr>'
                    )
                size_html = f"""
                <div class="cycles-section">
                    <h4>Size Fix Cycles</h4>
                    <table>
                        <tr><th>#</th><th>HiTeXeR px</th><th>TeXeR px</th><th>W ratio</th><th>H ratio</th><th>W err</th><th>H err</th></tr>
                        {"".join(rows)}
                    </table>
                </div>"""

            # Build button row
            code = rec.get("asy_code", "")
            wrapped_code = f"[asy]\n{code}\n[/asy]"
            hitexer_href = HITEXER_URL + "#code=" + urllib.parse.quote(wrapped_code, safe="")
            code_esc = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
            buttons_html = f"""
                <div class="link-row">
                    <a class="btn" href="{hitexer_href}" target="_blank">Open in HiTeXeR</a>
                    <button class="btn texer-btn" data-code="{code_esc}">Open in TeXeR</button>
                </div>"""

            sections.append(f"""
            <div class="diagram-card {status_class}">
                <div class="card-header">
                    <h3>Diagram #{i+1}: {rec['id']}</h3>
                    <div class="card-meta">
                        {status_badge}
                        <span class="meta-item">Corpus: {rec['corpus_file']}</span>
                        <span class="meta-item">Comparator: #{rec['comparator_idx']}</span>
                    </div>
                </div>
                {images_html}
                {buttons_html}
                {cycles_html}
                {size_html}
            </div>""")

        n_done = sum(1 for r in self.diagrams if r["status"] == "done")
        n_total = len(self.diagrams)

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="10">
<title>Auto-Fix Loop Progress</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f0f2f5; padding: 20px; color: #333;
}}
.container {{ max-width: 1400px; margin: 0 auto; }}
h1 {{ text-align: center; color: #1a1a2e; margin-bottom: 4px; font-size: 1.6em; }}
.subtitle {{ text-align: center; color: #666; font-size: 0.9em; margin-bottom: 20px; }}
.progress-bar {{
    background: #e0e0e0; border-radius: 8px; height: 24px; margin-bottom: 24px;
    overflow: hidden; position: relative;
}}
.progress-fill {{
    background: linear-gradient(90deg, #4caf50, #2d8a4e);
    height: 100%; border-radius: 8px;
    transition: width 0.5s ease;
}}
.progress-text {{
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 0.8em; font-weight: 700; color: #333;
}}
.diagram-card {{
    background: #fff; border-radius: 10px; margin-bottom: 24px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.07); overflow: hidden;
}}
.diagram-card.active {{ border-left: 4px solid #ff9800; }}
.diagram-card.done {{ border-left: 4px solid #4caf50; }}
.card-header {{
    background: #1a1a2e; color: #fff; padding: 12px 20px;
}}
.card-header h3 {{ font-size: 1em; margin-bottom: 4px; }}
.card-meta {{ display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }}
.badge {{
    padding: 2px 10px; border-radius: 10px; font-size: 0.75em;
    font-weight: 700; color: #fff;
}}
.badge.done {{ background: #4caf50; }}
.badge.active {{ background: #ff9800; }}
.badge.error {{ background: #f44336; }}
.meta-item {{ font-size: 0.8em; color: #aaa; }}
.images-row {{
    display: flex; gap: 12px; padding: 16px; flex-wrap: wrap;
    justify-content: center;
}}
.img-col {{ flex: 1; min-width: 200px; max-width: 420px; text-align: center; }}
.img-label {{
    font-size: 0.75em; color: #888; text-transform: uppercase;
    letter-spacing: 1px; margin-bottom: 6px;
}}
.img-col img {{
    max-width: 100%; border: 1px solid #ddd; border-radius: 6px;
    background: #fff;
}}
.placeholder {{
    color: #bbb; padding: 40px; border: 2px dashed #ddd;
    border-radius: 6px; font-size: 0.85em; text-align: center;
    min-width: 200px; flex: 1;
}}
.cycles-section {{ padding: 12px 20px 16px; }}
.cycles-section h4 {{
    font-size: 0.85em; color: #555; margin-bottom: 8px;
    text-transform: uppercase; letter-spacing: 0.5px;
}}
table {{
    width: 100%; border-collapse: collapse; font-size: 0.85em;
}}
th, td {{
    text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee;
}}
th {{ background: #f5f5f5; font-weight: 600; color: #555; }}
.link-row {{ display: flex; gap: 8px; flex-wrap: wrap; padding: 8px 16px 12px; }}
.btn {{
    display: inline-block; padding: 4px 12px; font-size: 0.8em; font-weight: 600;
    color: #1a1a2e; background: #e8e8f0; border: 1px solid #c0c0d0;
    border-radius: 4px; text-decoration: none; cursor: pointer; font-family: inherit;
}}
.btn:hover {{ background: #1a1a2e; color: #fff; }}
</style>
<script>
document.addEventListener('DOMContentLoaded', function() {{
  document.querySelectorAll('.texer-btn').forEach(function(btn) {{
    btn.addEventListener('click', function() {{
      var code = btn.getAttribute('data-code');
      navigator.clipboard.writeText(code).then(function() {{
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() {{ btn.textContent = orig; }}, 1500);
        window.open('https://artofproblemsolving.com/texer/', '_blank');
      }});
    }});
  }});
}});
</script>
</head>
<body>
<div class="container">
<h1>HiTeXeR Auto-Fix Loop</h1>
<p class="subtitle">Last updated: {timestamp} &mdash; {n_done}/{n_total} diagrams completed</p>
<div class="progress-bar">
    <div class="progress-fill" style="width:{100*n_done/max(n_total,1):.0f}%"></div>
    <div class="progress-text">{n_done}/{n_total}</div>
</div>
{"".join(sections)}
</div>
</body>
</html>"""
        self.path.write_text(html, encoding="utf-8")


# ── Main loop ────────────────────────────────────────────────────

def main():
    # Ensure stdout handles Unicode on Windows
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description="Auto-fix loop for HiTeXeR diagrams")
    parser.add_argument("--count", type=int, default=0,
                        help="Number of diagrams to process (0 = unlimited)")
    parser.add_argument("--id", type=str, default=None,
                        help="Start with a specific diagram ID (e.g. 01333)")
    parser.add_argument("--max-visual-cycles", type=int, default=5,
                        help="Max visual fix cycles per diagram")
    parser.add_argument("--max-size-cycles", type=int, default=3,
                        help="Max size fix cycles per diagram")
    parser.add_argument("--no-browser", action="store_true",
                        help="Don't open browser automatically")
    args = parser.parse_args()

    # Load eligible diagrams
    eligible = load_eligible_diagrams()
    if not eligible:
        print("No eligible diagrams found.")
        sys.exit(1)
    print(f"Found {len(eligible)} eligible diagrams.")

    # Build lookup by ID
    by_id = {r["id"]: r for r in eligible}

    # Set up report
    report = LiveReport(REPORT_PATH)
    if not args.no_browser:
        webbrowser.open(REPORT_PATH.as_uri())

    # Track which diagrams we've processed this session
    processed = set()
    diagrams_done = 0

    # If a specific ID is requested, start with it
    start_id = args.id

    # Ensure reference PNG cache dir exists
    TEXER_DIR.mkdir(exist_ok=True)

    # Temp directory for intermediate PNGs
    tmp_dir = ROOT / "_autofix_tmp"
    tmp_dir.mkdir(exist_ok=True)

    # Start Selenium driver for TeXeR fetching
    texer_driver = None
    if HAS_SELENIUM:
        print("Starting Selenium WebDriver for AoPS TeXeR...")
        try:
            texer_driver = setup_texer_driver()
            print("TeXeR ready.")
        except Exception as e:
            print(f"Warning: Could not start TeXeR driver: {e}")

    try:
        while True:
            # Check count limit
            if args.count > 0 and diagrams_done >= args.count:
                print(f"\nReached limit of {args.count} diagrams. Stopping.")
                break

            # Pick a diagram
            if start_id and start_id in by_id:
                diag = by_id[start_id]
                start_id = None  # only use it once
            else:
                # Pick random from eligible, avoiding already-processed
                remaining = [r for r in eligible if r["id"] not in processed]
                if not remaining:
                    print("\nAll eligible diagrams processed. Stopping.")
                    break
                diag = random.choice(remaining)

            diag_id = diag["id"]
            corpus_file = diag.get("corpusFile", f"{diag_id}.asy")
            processed.add(diag_id)
            diagrams_done += 1

            # Find the comparator index (1-based position in SSIM results)
            comparator_idx = diag.get("idx", 0) + 1

            asy_path = ASY_SRC_DIR / f"{diag_id}.asy"

            print(f"\n{'='*60}")
            print(f"Diagram {diagrams_done}: {diag_id}  (comparator #{comparator_idx})")
            print(f"  File: {corpus_file}")
            print(f"  SSIM: {diag.get('ssim', 'n/a')}")
            print(f"{'='*60}")

            # Read asy source
            asy_code = asy_path.read_text(encoding="utf-8")

            # Get (or fetch via TeXeR) reference PNG
            try:
                print("  Getting reference PNG...")
                texer_path = get_reference_png(diag_id, texer_driver)
                print(f"  Reference PNG: {texer_path}")
            except Exception as e:
                print(f"  Reference PNG FAILED: {e}")
                continue

            # Set up report entry
            rec = report.add_diagram(diag_id, corpus_file, comparator_idx, asy_code)
            report.set_texer_image(rec, texer_path)

            # Render initial HiTeXeR
            htx_before_path = tmp_dir / f"{diag_id}_before.png"
            htx_current_path = tmp_dir / f"{diag_id}_current.png"

            try:
                print("  Rendering initial HiTeXeR...")
                w, h, intr_w, intr_h = render_hitexer_png(asy_path, htx_before_path)
                if intr_w is not None:
                    print(f"  HiAsymptote render: {w}x{h} px  (intrinsic: {intr_w:.0f}x{intr_h:.0f} CSS px)")
                else:
                    print(f"  HiAsymptote render: {w}x{h} px")
                shutil.copy2(htx_before_path, htx_current_path)
                report.set_htx_before(rec, htx_before_path)
            except Exception as e:
                print(f"  HiAsymptote render FAILED: {e}")
                report.mark_done(rec, status=f"render_error: {str(e)[:100]}")
                continue

            # ── Visual fix loop ──────────────────────────────────
            print("\n  --- Visual Fix Loop ---")
            for cycle in range(1, args.max_visual_cycles + 1):
                print(f"\n  Visual cycle {cycle}/{args.max_visual_cycles}")

                # Re-render HiTeXeR (in case Opus changed asy-interp.js)
                if cycle > 1:
                    try:
                        print("    Re-rendering HiTeXeR...")
                        render_hitexer_png(asy_path, htx_current_path)
                        report.set_htx_after(rec, htx_current_path)
                    except Exception as e:
                        print(f"    Re-render failed: {e}")
                        break

                # Call Sonnet to compare
                print("    Calling Sonnet to compare...")
                has_issues, description = claude_sonnet_compare(
                    htx_current_path, texer_path, asy_code
                )
                print(f"    Has issues: {has_issues}")
                print(f"    Description: {description[:150]}")

                if not has_issues:
                    print("    No major visual discrepancies. Moving to size check.")
                    report.add_cycle(rec, cycle, "No major discrepancies found.")
                    break

                report.add_cycle(rec, cycle, description)

                # Call Opus to fix
                print("    Calling Opus to fix the issue...")
                opus_out = claude_opus_fix(
                    htx_current_path, texer_path, asy_code, description, diag_id
                )
                print(f"    Opus done. Output length: {len(opus_out)}")

            # Update the "after" image and capture intrinsic dims for size loop
            try:
                _, _, intr_w, intr_h = render_hitexer_png(asy_path, htx_current_path)
                report.set_htx_after(rec, htx_current_path)
            except Exception as e:
                print(f"  Final re-render failed: {e}")
                intr_w, intr_h = None, None

            # ── Size fix loop ────────────────────────────────────
            # Both HiTeXeR and the AoPS TeXeR output PNGs at the same effective
            # scale (both renderers produce images meant to be displayed at 1:1
            # screen pixels for the same physical size).  So the goal is simply
            # that pixel dimensions match: htx_px ≈ texer_px.
            #
            # We download the actual TeXeR PNG (not the CSS-scaled screenshot)
            # so the sidecar JSON contains the true server-side pixel dimensions.

            # Load TeXeR true pixel dimensions from sidecar JSON if available
            dims_path = texer_path.with_suffix(".json")
            if dims_path.exists():
                dims = json.loads(dims_path.read_text(encoding="utf-8"))
                texer_natural = (dims["w"], dims["h"])
            else:
                texer_natural = get_image_size(texer_path)
            print(f"\n  TeXeR reference dims: {texer_natural[0]}x{texer_natural[1]} px")

            print("  --- Size Fix Loop ---")
            for size_cycle in range(1, args.max_size_cycles + 1):
                # Compare HiTeXeR at 144-DPI equivalent vs AoPS TeXeR PNG.
                # AoPS TeXeR serves PNGs at ~144 DPI (2x Retina).
                # HiTeXeR rasterizes at 144 DPI, so projected px = intrinsic_css × 2.
                # Using intrinsic × 2 avoids container-shrink distortion.
                if intr_w is not None and intr_h is not None:
                    htx_display_size = (int(round(intr_w * 2)), int(round(intr_h * 2)))
                    dim_label = "projected 144-DPI px"
                else:
                    # Fallback to actual PNG dims if intrinsic not available
                    try:
                        htx_display_size = get_image_size(htx_current_path)
                    except Exception:
                        break
                    dim_label = "PNG px (no intrinsic)"

                # Direct ratio comparison (target = 1.0)
                w_ratio = htx_display_size[0] / texer_natural[0] if texer_natural[0] else 1.0
                h_ratio = htx_display_size[1] / texer_natural[1] if texer_natural[1] else 1.0
                w_err = abs(w_ratio - 1.0)
                h_err = abs(h_ratio - 1.0)

                print(f"\n  Size cycle {size_cycle}/{args.max_size_cycles}")
                print(f"    HiTeXeR: {htx_display_size[0]}x{htx_display_size[1]} {dim_label}")
                print(f"    TeXeR:   {texer_natural[0]}x{texer_natural[1]} px")
                print(f"    Pixel ratio: w={w_ratio:.4f}  h={h_ratio:.4f}  (target 1.0)")
                print(f"    Size error: w={w_err:.3f}  h={h_err:.3f}  (target < 0.05)")

                report.add_size_cycle(rec, size_cycle, htx_display_size, texer_natural)

                if w_err <= 0.05 and h_err <= 0.05:
                    print("    Pixel sizes match within 5%. Done.")
                    break

                direction = "larger" if w_ratio > 1.0 else "smaller"

                # If width and height are off by very different amounts, it's an
                # aspect ratio mismatch — not fixable by bpToCSSPx (which scales
                # both dimensions equally).
                if htx_display_size[1] and texer_natural[1]:
                    ar_htx = htx_display_size[0] / htx_display_size[1]
                    ar_tex = texer_natural[0] / texer_natural[1]
                    ar_err = abs(ar_htx / ar_tex - 1.0) if ar_tex else 0
                    if ar_err > 0.05:
                        print(f"    Aspect ratio mismatch (HiTeXeR {ar_htx:.3f} vs TeXeR {ar_tex:.3f}) "
                              f"— diagram-specific rendering bug, not bpToCSSPx. Skipping.")
                        break

                # Only attempt a bpToCSSPx fix if the ratio suggests a plausible
                # global offset (0.7–1.4x).  Outside this range the discrepancy is
                # likely a diagram-specific rendering bug, not a global constant issue,
                # and changing bpToCSSPx would break all other diagrams.
                if not (0.7 <= w_ratio <= 1.4):
                    print(f"    HiTeXeR is {w_err*100:.1f}% {direction} — ratio {w_ratio:.3f} outside "
                          f"[0.7, 1.4], likely a diagram-specific bug. Skipping bpToCSSPx fix.")
                    break

                print(f"    HiTeXeR is {w_err*100:.1f}% {direction} than TeXeR. Calling Opus to fix...")
                claude_opus_fix_size(
                    htx_current_path, texer_path, htx_display_size, texer_natural, diag_id,
                )

                # Re-render and capture new intrinsic dims
                try:
                    _, _, intr_w, intr_h = render_hitexer_png(asy_path, htx_current_path)
                    report.set_htx_after(rec, htx_current_path)
                except Exception as e:
                    print(f"    Re-render after size fix failed: {e}")
                    break

            report.mark_done(rec)
            print(f"\n  Diagram {diag_id} complete.")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
    finally:
        # Clean up temp dir
        shutil.rmtree(tmp_dir, ignore_errors=True)
        # Close Selenium driver
        if texer_driver is not None:
            try:
                texer_driver.quit()
            except Exception:
                pass

    print(f"\nReport saved to: {REPORT_PATH}")
    print(f"Diagrams processed: {diagrams_done}")


if __name__ == "__main__":
    main()
