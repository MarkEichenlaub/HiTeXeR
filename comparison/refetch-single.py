"""
Re-fetch a single TeXeR PNG by ID, with cache-busting.

Adds a space at the end of the second line of the Asymptote source code
before submitting to TeXeR, so the server sees different input and
doesn't return a cached image.

Usage:
    python comparison/refetch-single.py <id>
    e.g. python comparison/refetch-single.py 00042
"""

import sys
import time
import json
import requests
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.chrome.service import Service

try:
    from webdriver_manager.chrome import ChromeDriverManager
    USE_WDM = True
except ImportError:
    USE_WDM = False

ROOT = Path(__file__).parent.parent
ASY_SRC_DIR = ROOT / "comparison" / "asy_src"
TEXER_DIR = ROOT / "comparison" / "texer_pngs"
TEXER_URL = "https://artofproblemsolving.com/texer/"


def setup_driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1400,1000")
    options.add_argument("--disable-extensions")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    if USE_WDM:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)
    else:
        return webdriver.Chrome(options=options)


def dismiss_modals(driver):
    try:
        driver.execute_script("""
            document.querySelectorAll('.aops-modal-wrapper').forEach(function(el) {
                var btn = el.querySelector('.aops-modal-btn, button');
                if (btn) btn.click();
            });
            document.querySelectorAll('.aops-modal-wrapper').forEach(function(el) {
                el.style.display = 'none';
            });
            document.querySelectorAll('.aops-modal-overlay, .modal-backdrop').forEach(function(el) {
                el.style.display = 'none';
            });
        """)
    except Exception:
        pass


def check_error_modal(driver):
    try:
        return driver.execute_script("""
            var wrappers = document.querySelectorAll('.aops-modal-wrapper');
            for (var i = 0; i < wrappers.length; i++) {
                var w = wrappers[i];
                if (w.offsetParent !== null || w.style.display !== 'none') {
                    var text = w.innerText || '';
                    if (text.length > 5) {
                        var btn = w.querySelector('.aops-modal-btn, button');
                        if (btn) btn.click();
                        w.style.display = 'none';
                        return text.substring(0, 300);
                    }
                }
            }
            return null;
        """)
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python comparison/refetch-single.py <id>", file=sys.stderr)
        sys.exit(1)

    diagram_id = sys.argv[1]
    src_path = ASY_SRC_DIR / f"{diagram_id}.asy"
    out_path = TEXER_DIR / f"{diagram_id}.png"

    if not src_path.exists():
        print(json.dumps({"ok": False, "error": f"Source not found: {src_path}"}))
        sys.exit(1)

    code = src_path.read_text(encoding="utf-8")

    # Cache-bust: add a space at the end of the second line
    lines = code.split('\n')
    if len(lines) >= 2:
        lines[1] = lines[1] + ' '
    else:
        lines[-1] = lines[-1] + ' '
    busted_code = '\n'.join(lines)

    wrapped = f"[asy]\n{busted_code}\n[/asy]"

    driver = None
    try:
        driver = setup_driver()
        driver.get(TEXER_URL)
        time.sleep(3)
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )
        time.sleep(1)
        dismiss_modals(driver)

        # Record old image src so we can detect when a new one appears
        old_src = driver.execute_script("""
            var img = document.querySelector('#preview img');
            return img ? img.src : '';
        """)

        # Set code in CodeMirror
        driver.execute_script("""
            var cm = document.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) {
                cm.CodeMirror.setValue(arguments[0]);
            }
        """, wrapped)

        time.sleep(0.3)
        dismiss_modals(driver)

        # Click render
        driver.execute_script("document.getElementById('render-image').click();")

        # Wait for new image
        img_src = None
        start = time.time()
        timeout = 45
        while time.time() - start < timeout:
            result = driver.execute_script("""
                var img = document.querySelector('#preview img');
                if (!img) return null;
                if (!img.src) return null;
                if (!img.complete) return null;
                if (img.naturalWidth === 0) return null;
                return img.src;
            """)
            if result and result != old_src:
                img_src = result
                break

            if time.time() - start > 5:
                modal_err = check_error_modal(driver)
                if modal_err:
                    print(json.dumps({"ok": False, "error": f"compile_error: {modal_err}"}))
                    sys.exit(1)

            time.sleep(0.5)

        if not img_src:
            print(json.dumps({"ok": False, "error": "timeout waiting for render"}))
            sys.exit(1)

        # Download the image
        resp = requests.get(img_src, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 100:
            with open(out_path, 'wb') as f:
                f.write(resp.content)
            print(json.dumps({"ok": True, "id": diagram_id, "path": str(out_path)}))
        else:
            # Fallback: element screenshot
            try:
                img_el = driver.find_element(By.CSS_SELECTOR, "#preview img")
                img_el.screenshot(str(out_path))
                print(json.dumps({"ok": True, "id": diagram_id, "path": str(out_path), "method": "screenshot"}))
            except Exception:
                print(json.dumps({"ok": False, "error": "download_failed"}))
                sys.exit(1)

    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)[:300]}))
        sys.exit(1)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
