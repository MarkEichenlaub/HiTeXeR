"""
Refetch the denylisted (corrupted) TeXeR reference PNGs with the corrected
natural-bytes download (see auto-fix/fetch-texer-png.py note: the old element
screenshot captured CSS display size, capping at the ~611px preview pane).

For each id in comparison/ref-denylist.json:
  1. back up the existing PNG to comparison/texer_pngs_backup_pre_refetch/
  2. render the asy source on TeXeR, download img.src natural bytes
  3. validate: PNG magic + dims within 18% of the local-asy oracle bbox
     (oracleBp * 10/3); on failure restore the backup and keep denylisted
  4. write a result log to _refetch_results.json

Usage: python _refetch_denylist.py [--limit N] [--only id1,id2]
"""
import sys
import os
import json
import time
import base64
from pathlib import Path

ROOT = Path(__file__).parent
ASY_SRC_DIR = ROOT / "comparison" / "asy_src"
TEXER_DIR = ROOT / "comparison" / "texer_pngs"
BACKUP_DIR = ROOT / "comparison" / "texer_pngs_backup_pre_refetch"
DENYLIST = ROOT / "comparison" / "ref-denylist.json"
RESULTS = ROOT / "_refetch_results.json"
TEXER_URL = "https://artofproblemsolving.com/texer/"

limit = None
only = None
argv = sys.argv[1:]
for i, a in enumerate(argv):
    if a == "--limit":
        limit = int(argv[i + 1])
    if a == "--only":
        only = set(argv[i + 1].split(","))

deny = json.loads(DENYLIST.read_text(encoding="utf-8"))["entries"]
ids = sorted(deny.keys())
if only:
    ids = [i for i in ids if i in only]
if limit:
    ids = ids[:limit]

BACKUP_DIR.mkdir(parents=True, exist_ok=True)

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

options = webdriver.ChromeOptions()
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1200,900")
options.add_argument("--disable-extensions")
options.add_experimental_option("excludeSwitches", ["enable-automation"])
driver = webdriver.Chrome(options=options)

results = {}


def png_dims(data):
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def fetch_one(id_):
    src_path = ASY_SRC_DIR / f"{id_}.asy"
    if not src_path.exists():
        return {"status": "no-src"}
    asy_code = src_path.read_text(encoding="utf-8", errors="replace")
    wrapped = "[asy]\n" + asy_code + "\n[/asy]"

    # clear old preview + old code
    driver.execute_script("""
        var preview = document.getElementById('preview');
        if (preview) preview.querySelectorAll('img').forEach(function(i){ i.remove(); });
    """)
    ok = driver.execute_script("""
        var cm = document.querySelector('.CodeMirror');
        if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(arguments[0]); return true; }
        return false;
    """, wrapped)
    if not ok:
        return {"status": "no-editor"}
    time.sleep(0.3)
    try:
        driver.find_element(By.CSS_SELECTOR, "#render-image").click()
    except Exception:
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.common.keys import Keys
        ActionChains(driver).send_keys(Keys.CONTROL + Keys.RETURN).perform()

    try:
        WebDriverWait(driver, 90).until(lambda d: d.execute_script("""
            var img = document.querySelector('#preview img');
            return img && img.src && img.complete && img.naturalWidth > 0;
        """))
    except Exception:
        return {"status": "render-timeout"}

    # img.src lives on latex.artofproblemsolving.com — a DIFFERENT subdomain,
    # so an in-page fetch() is CORS-blocked. Download it python-side with the
    # browser session's cookies instead (natural bytes, no CSS downscale).
    src_url = driver.execute_script(
        "var img = document.querySelector('#preview img'); return img ? img.src : null;")
    if not src_url:
        return {"status": "no-img-src"}
    import requests
    sess = requests.Session()
    for c in driver.get_cookies():
        sess.cookies.set(c["name"], c["value"], domain=c.get("domain"))
    try:
        resp = sess.get(src_url, timeout=60,
                        headers={"Referer": TEXER_URL, "User-Agent": "Mozilla/5.0"})
    except Exception as e:
        return {"status": "download-error", "detail": str(e)[:120]}
    if resp.status_code != 200:
        return {"status": "http-" + str(resp.status_code)}
    data = resp.content
    if not data.startswith(b"\x89PNG"):
        return {"status": "not-png", "bytes": len(data)}
    w, h = png_dims(data)

    # validate vs oracle bbox (bp * 10/3), generous tolerance for label metrics
    entry = deny.get(id_) or {}
    ob = entry.get("oracleBp")
    if ob:
        ew, eh = ob[0] * 10.0 / 3.0, ob[1] * 10.0 / 3.0
        if ew > 40 and eh > 40:
            if abs(w / ew - 1) > 0.18 or abs(h / eh - 1) > 0.18:
                return {"status": "dims-mismatch", "got": [w, h], "expected": [round(ew), round(eh)]}

    out_path = TEXER_DIR / f"{id_}.png"
    if out_path.exists():
        bak = BACKUP_DIR / f"{id_}.png"
        if not bak.exists():
            bak.write_bytes(out_path.read_bytes())
    out_path.write_bytes(data)
    return {"status": "ok", "dims": [w, h]}


print(f"[refetch] navigating to TeXeR...", flush=True)
driver.get(TEXER_URL)
time.sleep(3)
WebDriverWait(driver, 30).until(lambda d: d.execute_script(
    "var cm = document.querySelector('.CodeMirror'); return cm && cm.CodeMirror ? true : false;"))

ok_n = 0
for n, id_ in enumerate(ids):
    try:
        r = fetch_one(id_)
    except Exception as e:
        r = {"status": "error", "detail": str(e)[:200]}
    results[id_] = r
    if r["status"] == "ok":
        ok_n += 1
    print(f"[refetch] {n+1}/{len(ids)} {id_}: {json.dumps(r)}", flush=True)
    RESULTS.write_text(json.dumps(results, indent=1), encoding="utf-8")
    time.sleep(1.5)

print(f"[refetch] done: {ok_n}/{len(ids)} ok", flush=True)
driver.quit()
