"""
Automated AoPS TeXeR rendering for SSIM comparison.

Uses Selenium to render the first N diagrams (by SSIM rank) on
https://artofproblemsolving.com/texer/ and save the resulting PNGs.

Usage:
    python fetch-texer-renders.py [--count 100] [--start 0]

Requirements:
    pip install selenium webdriver-manager requests
"""

import argparse
import json
import os
import time
import base64
import urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service

try:
    from webdriver_manager.chrome import ChromeDriverManager
    USE_WDM = True
except ImportError:
    USE_WDM = False

ROOT = Path(__file__).parent
COMPARISON = ROOT / "comparison"
SSIM_RESULTS = COMPARISON / "ssim-results.json"
ASY_SRC_DIR = COMPARISON / "asy_src"
TEXER_DIR = COMPARISON / "texer_pngs"
TEXER_URL = "https://artofproblemsolving.com/texer/"


def setup_driver():
    """Create a Chrome WebDriver instance."""
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1200,900")
    # Don't use headless — TeXeR may need visible browser for rendering
    options.add_argument("--disable-extensions")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])

    if USE_WDM:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)
    else:
        return webdriver.Chrome(options=options)


def ensure_texer_loaded(driver):
    """Navigate to TeXeR if not already there, wait for CodeMirror."""
    current = driver.current_url
    if "artofproblemsolving.com/texer/" not in current:
        driver.get(TEXER_URL)
        time.sleep(3)
        # Wait for CodeMirror to be ready
        WebDriverWait(driver, 15).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )


def render_on_texer(driver, asy_code, output_path, timeout=60):
    """
    Render Asymptote code on the AoPS TeXeR and save the image.

    Page structure (discovered via inspection):
    - Editor: CodeMirror wrapping textarea#boomer
    - Render button: span#render-image (in the crumb bar)
    - Output: #preview panel gets replaced with a single <img> tag
    - Image src: https://latex.artofproblemsolving.com/texer/X/SLUG.png?time=...

    To avoid race conditions (downloading a stale image before the server
    finishes compiling), we remove the old <img> from #preview before
    clicking render, then wait for a brand-new fully-loaded image, and
    extract its pixels via canvas rather than re-downloading from the URL.
    """
    ensure_texer_loaded(driver)

    # Remove any existing image from #preview so we can detect when a fresh one appears
    driver.execute_script("""
        var preview = document.getElementById('preview');
        if (preview) {
            var imgs = preview.querySelectorAll('img');
            imgs.forEach(function(img) { img.remove(); });
        }
    """)

    # Set code in the CodeMirror editor
    wrapped = f"[asy]\n{asy_code}\n[/asy]"
    cm_set = driver.execute_script("""
        var cm = document.querySelector('.CodeMirror');
        if (cm && cm.CodeMirror) {
            cm.CodeMirror.setValue(arguments[0]);
            return true;
        }
        return false;
    """, wrapped)

    if not cm_set:
        print("    Warning: CodeMirror not found, trying textarea fallback")
        driver.execute_script("""
            var ta = document.getElementById('boomer') || document.querySelector('textarea');
            if (ta) { ta.value = arguments[0]; ta.dispatchEvent(new Event('input', {bubbles:true})); }
        """, wrapped)

    time.sleep(0.3)

    # Click the "Render as Image" button (span#render-image)
    try:
        render_btn = driver.find_element(By.CSS_SELECTOR, "#render-image")
        render_btn.click()
    except Exception:
        from selenium.webdriver.common.action_chains import ActionChains
        ActionChains(driver).send_keys(Keys.CONTROL + Keys.RETURN).perform()

    # Wait for a new image to appear in #preview AND be fully loaded
    try:
        def image_fully_loaded(d):
            return d.execute_script("""
                var img = document.querySelector('#preview img');
                if (!img) return false;
                if (!img.src) return false;
                if (!img.complete) return false;
                if (img.naturalWidth === 0) return false;
                return true;
            """)

        WebDriverWait(driver, timeout).until(image_fully_loaded)

        # Use Selenium's element screenshot to capture exactly what the browser
        # rendered. This avoids CORS tainted-canvas issues with toDataURL(),
        # and avoids race conditions with re-downloading from the URL.
        img_el = driver.find_element(By.CSS_SELECTOR, "#preview img")
        img_el.screenshot(str(output_path))
        return True

    except Exception as e:
        print(f"    Failed to get image: {e}")
        try:
            preview = driver.find_element(By.CSS_SELECTOR, "#preview")
            preview.screenshot(str(output_path))
            return True
        except Exception:
            return False


def main():
    parser = argparse.ArgumentParser(description="Render Asymptote diagrams on AoPS TeXeR")
    parser.add_argument("--count", type=int, default=100, help="Number of diagrams to render (by SSIM rank)")
    parser.add_argument("--start", type=int, default=0, help="Starting rank (0-indexed)")
    parser.add_argument("--force", action="store_true", help="Re-render even if PNG already exists")
    args = parser.parse_args()

    if not SSIM_RESULTS.exists():
        print(f"Error: {SSIM_RESULTS} not found. Run the SSIM pipeline first.")
        return

    results = json.loads(SSIM_RESULTS.read_text())
    items = results[args.start : args.start + args.count]
    print(f"Rendering {len(items)} diagrams on AoPS TeXeR (ranks {args.start+1} to {args.start+len(items)})")

    TEXER_DIR.mkdir(parents=True, exist_ok=True)

    # Check which ones need rendering
    to_render = []
    for i, r in enumerate(items):
        rank = args.start + i + 1
        out_path = TEXER_DIR / f"{r['id']}.png"
        if out_path.exists() and not args.force:
            continue
        src_path = ASY_SRC_DIR / f"{r['id']}.asy"
        if not src_path.exists():
            print(f"  #{rank}: source not found ({r['id']}.asy)")
            continue
        to_render.append((rank, r, src_path, out_path))

    if not to_render:
        print("All diagrams already rendered. Use --force to re-render.")
        return

    print(f"  {len(to_render)} diagrams to render ({len(items) - len(to_render)} already done)")

    driver = setup_driver()
    ok = 0
    fail = 0

    try:
        # Navigate to TeXeR once upfront
        driver.get(TEXER_URL)
        time.sleep(3)
        WebDriverWait(driver, 15).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )
        print("  TeXeR loaded, starting renders...")

        for rank, r, src_path, out_path in to_render:
            code = src_path.read_text(encoding="utf-8")
            print(f"  #{rank} ({r['corpusFile']}, id={r['id']})...", end=" ", flush=True)

            try:
                success = render_on_texer(driver, code, out_path)
                if success:
                    print("OK")
                    ok += 1
                else:
                    print("FAIL")
                    fail += 1
            except Exception as e:
                print(f"ERROR: {e}")
                fail += 1

            # Brief pause between renders
            time.sleep(0.5)

    finally:
        driver.quit()

    print(f"\nDone: {ok} ok, {fail} failed")


if __name__ == "__main__":
    main()
