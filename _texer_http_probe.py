"""
Pure-HTTP TeXeR probe: submit asy code, get back either the compile error
text (signature decompiler) or the rendered 240-DPI PNG.

Usage:
    python _texer_http_probe.py <in.asy> <out.png>
    python _texer_http_probe.py --code "import TrigMacros; trig_axes(1);" <out.png>

Prints the error text on compile failure; saves PNG + prints size on success.
Reuses one requests.Session per run (token is session-tied).
"""
import sys
import re
import json
import base64
from pathlib import Path

import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get_session():
    s = requests.Session()
    r = s.get("https://artofproblemsolving.com/texer/", headers=UA, timeout=30)
    r.raise_for_status()
    m = re.search(r'token["\s:]+([0-9a-f]{16,})', r.text)
    if not m:
        raise RuntimeError("no token found on /texer/ page")
    return s, m.group(1)


def probe(s, token, code, out_path=None):
    wrapped = "[asy]\n" + code + "\n[/asy]"
    tex = base64.b64encode(wrapped.encode("utf-8")).decode("ascii")
    r = s.post(
        "https://artofproblemsolving.com/m/texer/ajax.php",
        data={"action": "image", "token": token, "tex": tex, "rerender": "false"},
        headers=UA, timeout=120,
    )
    r.raise_for_status()
    j = r.json()
    if j.get("error_code"):
        msg = j.get("error_msg", "")
        msg = msg.replace("&#039;", "'").replace("&quot;", '"').replace("&amp;", "&")
        return {"error": msg, "log": j.get("response", "")}
    urls = j["response"]["urls"]
    result = {"urls": urls, "width": j["response"].get("width")}
    if out_path and urls:
        u0 = urls[0]
        if u0.startswith("//"):
            u0 = "https:" + u0
        ir = s.get(u0, headers=UA, timeout=60)
        if ir.content.startswith(b"\x89PNG"):
            Path(out_path).write_bytes(ir.content)
            w = int.from_bytes(ir.content[16:20], "big")
            h = int.from_bytes(ir.content[20:24], "big")
            result["saved"] = f"{out_path} {w}x{h} ({len(ir.content)} bytes)"
    return result


def main():
    args = sys.argv[1:]
    if args and args[0] == "--code":
        code = args[1]
        out = args[2] if len(args) > 2 else None
    else:
        code = Path(args[0]).read_text(encoding="utf-8", errors="replace")
        out = args[1] if len(args) > 1 else None
    s, token = get_session()
    res = probe(s, token, code, out)
    if "error" in res:
        print("=== COMPILE ERROR ===")
        # dedupe repeated blocks
        seen = set()
        for line in res["error"].splitlines():
            if line.strip() and line not in seen:
                seen.add(line)
                print(line.encode("ascii", "replace").decode("ascii"))
    else:
        print(json.dumps({k: v for k, v in res.items() if k != "urls"}, indent=1))
        for u in res.get("urls", []):
            print("url:", u)


if __name__ == "__main__":
    main()
