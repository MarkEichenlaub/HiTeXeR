"""
Fetch the AoPS TeXeR reference PNG for a single diagram ID.

Usage:
    python auto-fix/fetch-texer-png.py <ID>
    python auto-fix/fetch-texer-png.py 05321

Exits 0 if the PNG already exists or was successfully fetched.
Exits 1 on failure (missing asy source, Selenium error, network issue).

Called by run-loop.js before spawning the sub-agent if the texer PNG is absent.
"""
import sys
import os
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
ASY_SRC_DIR = ROOT / "comparison" / "asy_src"
TEXER_DIR   = ROOT / "comparison" / "texer_pngs"
TEXER_URL   = "https://artofproblemsolving.com/texer/"


def main():
    if len(sys.argv) < 2:
        print("Usage: fetch-texer-png.py <ID>", file=sys.stderr)
        sys.exit(1)

    id_ = sys.argv[1].zfill(5)
    out_path = TEXER_DIR / f"{id_}.png"

    if out_path.exists():
        print(f"[fetch-texer] {id_}: already present, skipping")
        sys.exit(0)

    src_path = ASY_SRC_DIR / f"{id_}.asy"
    if not src_path.exists():
        print(f"[fetch-texer] {id_}: asy source not found at {src_path}", file=sys.stderr)
        sys.exit(1)

    asy_code = src_path.read_text(encoding="utf-8", errors="replace")
    TEXER_DIR.mkdir(parents=True, exist_ok=True)

    # Try to import Selenium; fail gracefully if not installed
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.chrome.service import Service
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            USE_WDM = True
        except ImportError:
            USE_WDM = False
    except ImportError:
        print("[fetch-texer] selenium not installed; skipping fetch", file=sys.stderr)
        sys.exit(1)

    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1200,900")
    options.add_argument("--disable-extensions")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])

    print(f"[fetch-texer] {id_}: launching Chrome to render on AoPS TeXeR...")
    try:
        if USE_WDM:
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
        else:
            driver = webdriver.Chrome(options=options)
    except Exception as e:
        print(f"[fetch-texer] Chrome launch failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        driver.get(TEXER_URL)
        time.sleep(3)

        # Wait for CodeMirror editor
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )

        # Clear old preview image
        driver.execute_script("""
            var preview = document.getElementById('preview');
            if (preview) {
                var imgs = preview.querySelectorAll('img');
                imgs.forEach(function(img) { img.remove(); });
            }
        """)

        # Set code in CodeMirror
        wrapped = f"[asy]\n{asy_code}\n[/asy]"
        ok = driver.execute_script("""
            var cm = document.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(arguments[0]); return true; }
            return false;
        """, wrapped)
        if not ok:
            driver.execute_script("""
                var ta = document.getElementById('boomer') || document.querySelector('textarea');
                if (ta) { ta.value = arguments[0]; ta.dispatchEvent(new Event('input', {bubbles:true})); }
            """, wrapped)

        time.sleep(0.3)

        # Click render button
        try:
            driver.find_element(By.CSS_SELECTOR, "#render-image").click()
        except Exception:
            from selenium.webdriver.common.action_chains import ActionChains
            from selenium.webdriver.common.keys import Keys
            ActionChains(driver).send_keys(Keys.CONTROL + Keys.RETURN).perform()

        # Wait for rendered image
        def image_ready(d):
            return d.execute_script("""
                var img = document.querySelector('#preview img');
                return img && img.src && img.complete && img.naturalWidth > 0;
            """)

        WebDriverWait(driver, 60).until(image_ready)

        # Screenshot the rendered image element
        img_el = driver.find_element(By.CSS_SELECTOR, "#preview img")
        img_el.screenshot(str(out_path))

        if out_path.exists() and out_path.stat().st_size > 0:
            print(f"[fetch-texer] {id_}: saved to {out_path} ({out_path.stat().st_size} bytes)")
            sys.exit(0)
        else:
            print(f"[fetch-texer] {id_}: screenshot saved but file empty", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"[fetch-texer] {id_}: render failed: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
