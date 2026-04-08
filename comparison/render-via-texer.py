"""
Render all corpus Asymptote diagrams via the AoPS TeXeR web service.

Uses Selenium to submit each diagram to https://artofproblemsolving.com/texer/,
wait for the rendered PNG, then download it directly from the image URL.

Supports parallel rendering with multiple Chrome instances via --workers.

Usage:
    python comparison/render-via-texer.py [--start 0] [--count 0] [--timeout 30] [--workers 1]

Requirements:
    pip install selenium requests
"""

import argparse
import json
import os
import time
import requests
from pathlib import Path
from multiprocessing import Process, Value, Lock, Manager

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
CORPUS_DIR = ROOT / "asy_corpus"
ASY_SRC_DIR = ROOT / "comparison" / "asy_src"
ASY_PNG_DIR = ROOT / "comparison" / "asy_pngs"
HTX_SVG_DIR = ROOT / "comparison" / "htx_svgs"
FAILURES_PATH = ROOT / "comparison" / "texer_failures.json"
TEXER_URL = "https://artofproblemsolving.com/texer/"


def num_id(i):
    return str(i + 1).zfill(5)


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
    """Dismiss any AoPS modal overlays that block interaction."""
    try:
        driver.execute_script("""
            // Click OK button on error modals first
            document.querySelectorAll('.aops-modal-wrapper').forEach(function(el) {
                var btn = el.querySelector('.aops-modal-btn, button');
                if (btn) btn.click();
            });
            // Then hide any remaining overlays
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
    """Check if an AoPS error modal is visible. Returns error text or None."""
    try:
        return driver.execute_script("""
            var wrappers = document.querySelectorAll('.aops-modal-wrapper');
            for (var i = 0; i < wrappers.length; i++) {
                var w = wrappers[i];
                if (w.offsetParent !== null || w.style.display !== 'none') {
                    var text = w.innerText || '';
                    if (text.length > 5) {
                        // Dismiss it
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


def load_texer(driver):
    """Navigate to TeXeR and wait for CodeMirror to be ready."""
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


def check_texer_error(driver):
    """Check if TeXeR is showing an error message. Returns error text or None."""
    try:
        return driver.execute_script("""
            var preview = document.getElementById('preview');
            if (!preview) return null;
            // Check for error text in preview area
            var text = preview.innerText || '';
            if (text.toLowerCase().includes('error') ||
                text.toLowerCase().includes('fatal') ||
                text.toLowerCase().includes('failed') ||
                text.toLowerCase().includes('undefined control sequence') ||
                text.toLowerCase().includes('no output')) {
                return text.substring(0, 500);
            }
            // Check for error elements
            var errEl = preview.querySelector('.error, .compile-error, .texer-error, [class*="error"]');
            if (errEl) return (errEl.innerText || errEl.textContent || 'unknown error').substring(0, 500);
            return null;
        """)
    except Exception:
        return None


def check_loading_indicator(driver):
    """Check if TeXeR is still loading/compiling."""
    try:
        return driver.execute_script("""
            var spinner = document.querySelector('.loading, .spinner, .compiling, #loading');
            if (spinner && spinner.offsetParent !== null) return true;
            var btn = document.getElementById('render-image');
            if (btn && btn.disabled) return true;
            return false;
        """)
    except Exception:
        return False


def render_on_texer(driver, asy_code, output_path, timeout=30):
    """Submit code to TeXeR, wait for image, download it.

    Returns (success: bool, reason: str).
    """
    # Dismiss any error modals from previous render
    dismiss_modals(driver)
    check_error_modal(driver)  # Also clicks OK on any error dialogs

    # Verify CodeMirror is still alive
    cm_alive = driver.execute_script(
        "var cm = document.querySelector('.CodeMirror');"
        "return cm && cm.CodeMirror ? true : false;"
    )
    if not cm_alive:
        return False, "codemirror_dead"

    # Record current image src so we can detect when a NEW image appears
    old_src = driver.execute_script("""
        var img = document.querySelector('#preview img');
        return img ? img.src : '';
    """)

    # Set code in CodeMirror
    wrapped = f"[asy]\n{asy_code}\n[/asy]"
    driver.execute_script("""
        var cm = document.querySelector('.CodeMirror');
        if (cm && cm.CodeMirror) {
            cm.CodeMirror.setValue(arguments[0]);
        }
    """, wrapped)

    time.sleep(0.3)
    dismiss_modals(driver)

    # Click render via JS (bypasses any overlay)
    driver.execute_script("document.getElementById('render-image').click();")

    # Poll for a NEW image (different src than before) that's fully loaded
    img_src = None
    start = time.time()
    last_error_check = start
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

        # Check for error modal or error text periodically (every 2s) to fail fast
        now = time.time()
        if now - last_error_check >= 2.0:
            last_error_check = now
            # Check for error modal (most common failure mode)
            modal_err = check_error_modal(driver)
            if modal_err:
                return False, f"compile_error: {modal_err}"
            # Check for error text in preview
            err = check_texer_error(driver)
            if err:
                return False, f"texer_error: {err}"

        time.sleep(0.5)

    if not img_src:
        # Final checks
        modal_err = check_error_modal(driver)
        if modal_err:
            return False, f"compile_error: {modal_err}"
        err = check_texer_error(driver)
        if err:
            return False, f"texer_error: {err}"
        return False, "timeout"

    # Download the image directly from the URL
    try:
        resp = requests.get(img_src, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 100:
            with open(output_path, 'wb') as f:
                f.write(resp.content)
            return True, "ok"
    except Exception:
        pass

    # Fallback: element screenshot
    try:
        img_el = driver.find_element(By.CSS_SELECTOR, "#preview img")
        img_el.screenshot(str(output_path))
        return True, "ok_screenshot"
    except Exception:
        return False, "download_failed"


def load_failures(path):
    """Load existing failure records."""
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_failures(path, failures):
    """Save failure records to JSON."""
    path.write_text(json.dumps(failures, indent=2), encoding="utf-8")


def worker_func(worker_id, chunk, timeout, shared_ok, shared_fail, lock,
                shared_failures, total_to_render):
    """Worker process: runs its own Chrome instance and renders a chunk of diagrams."""
    driver = None
    local_ok = 0
    local_fail = 0
    t0 = time.time()

    try:
        driver = setup_driver()
        load_texer(driver)
        print(f"  [W{worker_id}] TeXeR loaded, {len(chunk)} diagrams to render", flush=True)

        consecutive_fails = 0
        for idx, (corpus_idx, nid, filename, src_path, out_path) in enumerate(chunk):
            code = src_path.read_text(encoding="utf-8")

            success = False
            reason = "unknown"
            for attempt in range(2):
                try:
                    success, reason = render_on_texer(driver, code, out_path, timeout=timeout)
                    if success:
                        break
                    # If it was a texer_error (compile error), don't retry
                    if reason.startswith("texer_error"):
                        break
                    # If codemirror died, reload
                    if reason == "codemirror_dead":
                        load_texer(driver)
                        continue
                except Exception as e:
                    reason = f"exception: {type(e).__name__}: {str(e)[:200]}"
                    if attempt == 0 and (idx < 20 or consecutive_fails > 0):
                        print(f"    [W{worker_id}] Error on {nid} (attempt {attempt}): {reason}",
                              flush=True)
                    # Reload TeXeR on exception
                    try:
                        load_texer(driver)
                    except Exception:
                        pass

            if idx < 20:
                suffix = "" if success else f" ({reason[:60]})"
                print(f"    [W{worker_id}] {nid}: {'OK' if success else 'FAIL'}{suffix}", flush=True)

            if success:
                local_ok += 1
                consecutive_fails = 0
                # Remove from shared failures if previously recorded
                with lock:
                    if nid in shared_failures:
                        del shared_failures[nid]
            else:
                local_fail += 1
                consecutive_fails += 1
                # Record the failure in shared dict
                with lock:
                    shared_failures[nid] = {
                        "filename": filename,
                        "reason": reason,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }

                if consecutive_fails > 50:
                    print(f"  [W{worker_id}] Too many consecutive failures ({consecutive_fails}), stopping.",
                          flush=True)
                    break

            # Update shared counters
            with lock:
                shared_ok.value += (1 if success else 0)
                shared_fail.value += (0 if success else 1)
                global_total = shared_ok.value + shared_fail.value

            local_total = local_ok + local_fail
            if local_total % 50 == 0 and local_total > 0:
                elapsed = time.time() - t0
                rate = local_total / elapsed
                remaining = (len(chunk) - local_total) / rate if rate > 0 else 0
                with lock:
                    gt = shared_ok.value + shared_fail.value
                print(f"  [W{worker_id}] {local_total}/{len(chunk)} local | "
                      f"{gt}/{total_to_render} global  ok={local_ok} fail={local_fail}  "
                      f"{rate:.1f}/s  ~{remaining/60:.0f}m remaining", flush=True)

            time.sleep(0.3)

    except KeyboardInterrupt:
        print(f"\n  [W{worker_id}] Interrupted.", flush=True)
    except Exception as e:
        print(f"  [W{worker_id}] Fatal error: {e}", flush=True)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

    elapsed = time.time() - t0
    print(f"  [W{worker_id}] Done: {local_ok} ok, {local_fail} fail in {elapsed:.0f}s "
          f"({local_ok/(elapsed or 1):.1f}/s)", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Render corpus via AoPS TeXeR")
    parser.add_argument("--start", type=int, default=0, help="Start index (0-based)")
    parser.add_argument("--count", type=int, default=0, help="Number to render (0=all)")
    parser.add_argument("--timeout", type=int, default=30, help="Per-diagram timeout in seconds")
    parser.add_argument("--retry-failures", action="store_true",
                        help="Re-attempt previously failed diagrams")
    parser.add_argument("--workers", type=int, default=1,
                        help="Number of parallel Chrome instances (default: 1)")
    args = parser.parse_args()

    all_files = sorted(f for f in os.listdir(CORPUS_DIR) if f.endswith('.asy'))
    print(f"Corpus: {len(all_files)} .asy files", flush=True)

    htx_ids = set(f.replace('.svg', '') for f in os.listdir(HTX_SVG_DIR) if f.endswith('.svg'))

    # Load previous failure records
    failures = load_failures(FAILURES_PATH)
    previously_failed = set(failures.keys()) if not args.retry_failures else set()

    to_render = []
    for i, filename in enumerate(all_files):
        nid = num_id(i)
        if nid not in htx_ids:
            continue
        out_path = ASY_PNG_DIR / f"{nid}.png"
        if out_path.exists():
            continue
        # Skip previously failed diagrams unless --retry-failures
        if nid in previously_failed:
            continue
        src_path = ASY_SRC_DIR / f"{nid}.asy"
        if not src_path.exists():
            src_path = CORPUS_DIR / filename
        to_render.append((i, nid, filename, src_path, out_path))

    if args.start > 0:
        to_render = to_render[args.start:]
    if args.count > 0:
        to_render = to_render[:args.count]

    existing = len(htx_ids) - len(to_render) - len(previously_failed) - (args.start if args.start > 0 else 0)
    skipped_msg = f", {len(previously_failed)} prev failed skipped" if previously_failed else ""
    print(f"  {len(to_render)} to render, ~{existing} already exist{skipped_msg}", flush=True)

    if not to_render:
        print("Nothing to render.")
        return

    ASY_PNG_DIR.mkdir(parents=True, exist_ok=True)

    num_workers = max(1, min(args.workers, len(to_render)))

    # Single-worker mode: run directly (no multiprocessing overhead)
    if num_workers == 1:
        _run_single_worker(to_render, args.timeout, failures)
        return

    # Multi-worker mode: split work and run in parallel
    print(f"  Launching {num_workers} parallel workers...", flush=True)

    # Split to_render into chunks, distributing as evenly as possible
    chunks = [[] for _ in range(num_workers)]
    for i, item in enumerate(to_render):
        chunks[i % num_workers].append(item)

    # Shared state via multiprocessing Manager
    manager = Manager()
    shared_failures = manager.dict(failures)
    shared_ok = Value('i', 0)
    shared_fail = Value('i', 0)
    lock = Lock()

    t0 = time.time()
    processes = []
    for wid in range(num_workers):
        if not chunks[wid]:
            continue
        p = Process(
            target=worker_func,
            args=(wid, chunks[wid], args.timeout, shared_ok, shared_fail,
                  lock, shared_failures, len(to_render)),
        )
        p.start()
        processes.append(p)
        # Stagger launches slightly so Chrome instances don't all hit TeXeR at once
        if wid < num_workers - 1:
            time.sleep(2)

    # Wait for all workers to complete
    try:
        for p in processes:
            p.join()
    except KeyboardInterrupt:
        print("\nInterrupted - waiting for workers to finish...", flush=True)
        for p in processes:
            p.join(timeout=5)
        for p in processes:
            if p.is_alive():
                p.terminate()

    # Aggregate results from shared state
    final_failures = dict(shared_failures)
    save_failures(FAILURES_PATH, final_failures)

    elapsed = time.time() - t0
    total_ok = shared_ok.value
    total_fail = shared_fail.value
    print(f"\nDone: {total_ok} ok, {total_fail} fail in {elapsed:.0f}s "
          f"({total_ok/(elapsed or 1):.1f}/s) using {num_workers} workers", flush=True)
    if final_failures:
        print(f"  Total known failures: {len(final_failures)} (saved to {FAILURES_PATH})", flush=True)


def _run_single_worker(to_render, timeout, failures):
    """Original single-threaded rendering logic."""
    driver = setup_driver()
    ok = 0
    fail = 0
    t0 = time.time()

    try:
        load_texer(driver)
        print("  TeXeR loaded, starting renders...", flush=True)

        consecutive_fails = 0
        for idx, (corpus_idx, nid, filename, src_path, out_path) in enumerate(to_render):
            code = src_path.read_text(encoding="utf-8")

            success = False
            reason = "unknown"
            for attempt in range(2):
                try:
                    success, reason = render_on_texer(driver, code, out_path, timeout=timeout)
                    if success:
                        break
                    # If it was a texer_error (compile error), don't retry
                    if reason.startswith("texer_error"):
                        break
                    # If codemirror died, reload
                    if reason == "codemirror_dead":
                        load_texer(driver)
                        continue
                except Exception as e:
                    reason = f"exception: {type(e).__name__}: {str(e)[:200]}"
                    if attempt == 0 and (idx < 20 or consecutive_fails > 0):
                        print(f"    Error on {nid} (attempt {attempt}): {reason}", flush=True)
                    # Reload TeXeR on exception
                    try:
                        load_texer(driver)
                    except Exception:
                        pass

            if idx < 20:
                suffix = "" if success else f" ({reason[:60]})"
                print(f"    {nid}: {'OK' if success else 'FAIL'}{suffix}", flush=True)

            if success:
                ok += 1
                consecutive_fails = 0
                # Remove from failures if it was previously recorded
                if nid in failures:
                    del failures[nid]
            else:
                fail += 1
                consecutive_fails += 1
                # Record the failure
                failures[nid] = {
                    "filename": filename,
                    "reason": reason,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                # Save failures periodically
                if fail % 10 == 0:
                    save_failures(FAILURES_PATH, failures)

                if consecutive_fails > 50:
                    print(f"  Too many consecutive failures ({consecutive_fails}), stopping.", flush=True)
                    break

            total = ok + fail
            if total % 50 == 0 and total > 0:
                elapsed = time.time() - t0
                rate = total / elapsed
                remaining = (len(to_render) - total) / rate if rate > 0 else 0
                print(f"  {total}/{len(to_render)}  ok={ok} fail={fail}  "
                      f"{rate:.1f}/s  ~{remaining/60:.0f}m remaining", flush=True)

            time.sleep(0.3)

    except KeyboardInterrupt:
        print("\nInterrupted by user.", flush=True)
    finally:
        driver.quit()
        # Save final failure state
        save_failures(FAILURES_PATH, failures)

    elapsed = time.time() - t0
    print(f"\nDone: {ok} ok, {fail} fail in {elapsed:.0f}s ({ok/(elapsed or 1):.1f}/s)", flush=True)
    if failures:
        print(f"  Total known failures: {len(failures)} (saved to {FAILURES_PATH})", flush=True)


if __name__ == "__main__":
    main()
