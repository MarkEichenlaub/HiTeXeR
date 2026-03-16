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


def render_on_texer(driver, asy_code, output_path, timeout=30):
    """
    Render Asymptote code on the AoPS TeXeR and save the image.

    Steps:
    1. Navigate to TeXeR
    2. Clear the editor and paste the code wrapped in [asy]...[/asy]
    3. Click Render (or Ctrl+Enter)
    4. Wait for the image to appear
    5. Download and save the image
    """
    # Navigate to TeXeR
    driver.get(TEXER_URL)
    wait = WebDriverWait(driver, 15)

    # Wait for the editor textarea to be present
    editor = wait.until(EC.presence_of_element_located((By.ID, "boomer")))

    # Clear and enter code
    wrapped = f"[asy]\n{asy_code}\n[/asy]"
    editor.clear()
    time.sleep(0.3)

    # Use JavaScript to set value reliably (handles large code blocks)
    driver.execute_script(
        "arguments[0].value = arguments[1]; "
        "arguments[0].dispatchEvent(new Event('input'));",
        editor, wrapped
    )
    time.sleep(0.3)

    # Trigger render with Ctrl+Enter
    editor.send_keys(Keys.CONTROL + Keys.RETURN)

    # Wait for the rendered image to appear
    try:
        img_el = WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#texer_output img, .texer-output img, #output img"))
        )
        time.sleep(1)  # Extra wait for image to fully load

        # Get the image src
        img_src = img_el.get_attribute("src")

        if img_src and img_src.startswith("data:image"):
            # Data URL — decode directly
            header, data = img_src.split(",", 1)
            img_bytes = base64.b64decode(data)
            with open(output_path, "wb") as f:
                f.write(img_bytes)
            return True
        elif img_src and img_src.startswith("http"):
            # Regular URL — download
            # Use cookies from the browser session
            cookies = driver.get_cookies()
            opener = urllib.request.build_opener()
            cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
            opener.addheaders = [("Cookie", cookie_str)]
            urllib.request.install_opener(opener)
            urllib.request.urlretrieve(img_src, str(output_path))
            return True
        else:
            # Try screenshot of the image element
            img_el.screenshot(str(output_path))
            return True

    except Exception as e:
        print(f"    Failed to get image: {e}")
        # Try taking a screenshot of the output area as fallback
        try:
            output_div = driver.find_element(By.CSS_SELECTOR, "#texer_output, .texer-output, #output")
            output_div.screenshot(str(output_path))
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
