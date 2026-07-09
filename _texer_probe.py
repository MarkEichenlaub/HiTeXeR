"""
Submit arbitrary asy code to AoPS TeXeR and capture the rendered PNG
AND/OR the error/log text. Used to probe server-side macro packages
(TrigMacros etc): a deliberate arity mismatch makes asy print the real
declared signatures of a function.

Usage:
    python _texer_probe.py <in.asy> <out.png> [--keep-open]

Writes <out.png> if an image was produced; always writes <out.png>.log.txt
with whatever error/status text the page shows.
"""
import sys
import time
import base64
from pathlib import Path

TEXER_URL = "https://artofproblemsolving.com/texer/"


def main():
    src_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    asy_code = src_path.read_text(encoding="utf-8", errors="replace")

    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.chrome.service import Service
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        USE_WDM = True
    except ImportError:
        USE_WDM = False

    options = webdriver.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1200,900")
    options.add_argument("--disable-extensions")
    if "--headless" in sys.argv:
        options.add_argument("--headless=new")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])

    if USE_WDM:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    else:
        driver = webdriver.Chrome(options=options)

    log_lines = []
    try:
        driver.get(TEXER_URL)
        time.sleep(3)
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script(
                "var cm = document.querySelector('.CodeMirror');"
                "return cm && cm.CodeMirror ? true : false;"
            )
        )
        driver.execute_script("""
            var preview = document.getElementById('preview');
            if (preview) preview.querySelectorAll('img').forEach(function(i){i.remove();});
        """)
        wrapped = "[asy]\n" + asy_code + "\n[/asy]"
        driver.execute_script("""
            var cm = document.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) cm.CodeMirror.setValue(arguments[0]);
        """, wrapped)
        time.sleep(0.3)
        try:
            driver.find_element(By.CSS_SELECTOR, "#render-image").click()
        except Exception:
            from selenium.webdriver.common.action_chains import ActionChains
            from selenium.webdriver.common.keys import Keys
            ActionChains(driver).send_keys(Keys.CONTROL + Keys.RETURN).perform()

        # wait until either an image appears or error text shows up
        def done_check(d):
            return d.execute_script("""
                var img = document.querySelector('#preview img');
                if (img && img.src && img.complete && img.naturalWidth > 0) return 'img';
                var t = (document.getElementById('preview')||{}).innerText || '';
                var err = document.querySelector('.error, #error, .cm-error, .texer-error');
                if (err && err.innerText.trim()) return 'err';
                if (/error|Error|failed/.test(t) && t.trim().length > 10) return 'err';
                return false;
            """)
        try:
            WebDriverWait(driver, 90).until(done_check)
        except Exception:
            log_lines.append("[probe] TIMEOUT waiting for image/error")

        # capture all page text areas that might hold the asy log
        page_text = driver.execute_script("""
            var out = [];
            var prev = document.getElementById('preview');
            if (prev) out.push('--- #preview ---\\n' + prev.innerText);
            ['error','errors','log','output','stderr','texer-log'].forEach(function(id){
                var e = document.getElementById(id);
                if (e && e.innerText.trim()) out.push('--- #'+id+' ---\\n'+e.innerText);
            });
            document.querySelectorAll('.error, .alert, .texer-error, pre').forEach(function(e){
                if (e.innerText.trim()) out.push('--- '+(e.className||e.tagName)+' ---\\n'+e.innerText);
            });
            return out.join('\\n\\n');
        """)
        if page_text:
            log_lines.append(page_text)

        b64 = driver.execute_async_script("""
            var done = arguments[arguments.length - 1];
            var img = document.querySelector('#preview img');
            if (!img || !img.src) { done(null); return; }
            fetch(img.src, {credentials: 'include'}).then(function(r){return r.arrayBuffer();})
            .then(function(buf){
                var bytes = new Uint8Array(buf); var bin=''; var C=32768;
                for (var i=0;i<bytes.length;i+=C) bin += String.fromCharCode.apply(null, bytes.subarray(i,i+C));
                done(btoa(bin));
            }).catch(function(){ done(null); });
        """)
        if b64:
            data = base64.b64decode(b64)
            if data.startswith(b"\x89PNG"):
                out_path.write_bytes(data)
                w = int.from_bytes(data[16:20], "big")
                h = int.from_bytes(data[20:24], "big")
                log_lines.append(f"[probe] saved {w}x{h} PNG ({len(data)} bytes)")
            else:
                log_lines.append(f"[probe] non-PNG data ({len(data)} bytes)")
        else:
            log_lines.append("[probe] no image produced")
    finally:
        Path(str(out_path) + ".log.txt").write_text("\n".join(log_lines), encoding="utf-8")
        try:
            driver.quit()
        except Exception:
            pass
    print("\n".join(log_lines).encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    main()
