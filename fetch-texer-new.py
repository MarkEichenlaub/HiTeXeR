"""Fetch TeXeR reference PNGs for the NEWLY-APPENDED corpus ids only (those that
have an asy_src/<id>.asy but no texer_pngs/<id>.png yet). Reuses the proven
render logic in fetch-texer-renders.py (visible Chrome + AoPS TeXeR).

  python fetch-texer-new.py            # all new ids missing a texer png
  python fetch-texer-new.py 12991 14984  # explicit id-range
"""
import sys, time, importlib.util
from pathlib import Path

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('ftr', HERE / 'fetch-texer-renders.py')
ftr = importlib.util.module_from_spec(spec); spec.loader.exec_module(ftr)

from selenium.webdriver.support.ui import WebDriverWait

ASY_SRC = HERE / 'comparison' / 'asy_src'
TEXER = HERE / 'comparison' / 'texer_pngs'

lo = int(sys.argv[1]) if len(sys.argv) > 1 else 12991
hi = int(sys.argv[2]) if len(sys.argv) > 2 else 14984

ids = []
for i in range(lo, hi + 1):
    sid = f"{i:05d}"
    if (ASY_SRC / f"{sid}.asy").exists() and not (TEXER / f"{sid}.png").exists():
        ids.append(sid)
print(f"{len(ids)} new ids to fetch on TeXeR (range {lo}..{hi})", flush=True)
if not ids:
    sys.exit(0)

driver = ftr.setup_driver()
ok = fail = 0
try:
    driver.get(ftr.TEXER_URL)
    time.sleep(3)
    WebDriverWait(driver, 20).until(lambda d: d.execute_script(
        "var cm=document.querySelector('.CodeMirror');return cm&&cm.CodeMirror?true:false;"))
    print("  TeXeR loaded, starting renders...", flush=True)
    for k, sid in enumerate(ids):
        code = (ASY_SRC / f"{sid}.asy").read_text(encoding='utf-8')
        out = TEXER / f"{sid}.png"
        print(f"  [{k+1}/{len(ids)}] {sid}...", end=" ", flush=True)
        try:
            if ftr.render_on_texer(driver, code, out):
                print("OK", flush=True); ok += 1
            else:
                print("FAIL", flush=True); fail += 1
        except Exception as e:
            print(f"ERR {e}", flush=True); fail += 1
        time.sleep(0.4)
finally:
    driver.quit()
print(f"\nDone: {ok} ok, {fail} failed", flush=True)
