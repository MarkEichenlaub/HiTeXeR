"""Fetch Asymptote gallery .asy files from asymptote.sourceforge.io/gallery/.

Downloads all .asy files from the gallery index pages (and subdirectories)
and writes them to asy_corpus/ with a gallery_ prefix.

Files are named:
    gallery_<name>.asy                   for root gallery/
    gallery_<subdir>_<name>.asy          for subdirectories
"""
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE = "https://asymptote.sourceforge.io/gallery/"
SUBDIRS = ["", "2Dgraphs/", "3Dgraphs/", "3Dwebgl/", "IBL/", "animations/"]
CORPUS_DIR = Path(__file__).parent / "asy_corpus"
CORPUS_DIR.mkdir(exist_ok=True)

UA = "Mozilla/5.0 (compatible; HiTeXeR-gallery-fetch/1.0)"


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_text(url, timeout=30):
    return fetch(url, timeout).decode("utf-8", errors="replace")


def list_asy_in_dir(subdir):
    """Try .index1.html, .index2.html, etc. Collect all .asy hrefs."""
    asy = set()
    for i in range(1, 10):
        url = f"{BASE}{subdir}.index{i}.html"
        try:
            html = fetch_text(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                break
            print(f"  {url}: HTTP {e.code}", flush=True)
            break
        except Exception as e:
            print(f"  {url}: {e}", flush=True)
            break
        hrefs = re.findall(r'href="([^"]+\.asy)"', html)
        for h in hrefs:
            if "/" not in h:
                asy.add(h)
    # Also try the main gallery.html for the root
    if not subdir:
        try:
            html = fetch_text(f"{BASE}gallery.html")
            hrefs = re.findall(r'href="([^"]+\.asy)"', html)
            for h in hrefs:
                if "/" not in h:
                    asy.add(h)
        except Exception:
            pass
    return sorted(asy)


def main():
    total_new = 0
    total_skip = 0
    total_fail = 0
    for subdir in SUBDIRS:
        label = subdir.rstrip("/") or "root"
        print(f"\n[{label}] indexing {BASE}{subdir}", flush=True)
        try:
            names = list_asy_in_dir(subdir)
        except Exception as e:
            print(f"  Failed to index {label}: {e}", flush=True)
            continue
        print(f"  Found {len(names)} .asy files", flush=True)
        prefix = "gallery_" if not subdir else f"gallery_{subdir.rstrip('/')}_"
        for name in names:
            out = CORPUS_DIR / f"{prefix}{name}"
            if out.exists():
                total_skip += 1
                continue
            url = f"{BASE}{subdir}{name}"
            try:
                data = fetch(url)
                out.write_bytes(data)
                total_new += 1
            except Exception as e:
                print(f"  {name}: {e}", flush=True)
                total_fail += 1
            time.sleep(0.05)
        print(
            f"  [{label}] done: new={total_new} skip={total_skip} fail={total_fail}",
            flush=True,
        )
    print(
        f"\nTotal: new={total_new} skip={total_skip} fail={total_fail}",
        flush=True,
    )


if __name__ == "__main__":
    main()
