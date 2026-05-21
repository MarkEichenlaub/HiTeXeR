"""Generate thumbnails for every library record that has a reference PNG.

Pipeline:
  manifest.json record  -- id matches asy_corpus filename stem
       |
       v
  comparison/blink-manifest.json  -- maps numeric IDs to asy_corpus filenames
       |
       v
  comparison/texer_pngs/{NNNNN}.png  -- the reference render from AoPS TeXeR
       |
       v
  library/thumbs/{id}.webp  -- 320 px max-dim, quality 75

Records with no matching texer PNG get `thumb_path: null` so the UI can
show a placeholder; we'll backfill those via HiTeXeR's own renderer in
a later phase.

Re-run safety:
  - Existing thumbnails are kept (not re-encoded) unless --force is passed.
  - The manifest record's thumb_path is always rewritten.
"""

import os
import sys
import json
import argparse

from PIL import Image


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json')
BLINK_MANIFEST_PATH = os.path.join(REPO_ROOT, 'comparison',
                                   'blink-manifest.json')
TEXER_PNG_DIR = os.path.join(REPO_ROOT, 'comparison', 'texer_pngs')
THUMB_DIR = os.path.join(REPO_ROOT, 'library', 'thumbs')

MAX_DIM = 320
QUALITY = 75


def build_source_to_numeric_map():
    """source filename stem -> numeric id (e.g. 'c10_L1_script_0' -> '00001')."""
    with open(BLINK_MANIFEST_PATH, 'r', encoding='utf-8') as f:
        blink = json.load(f)
    diagrams = blink.get('diagrams', [])
    result = {}
    for d in diagrams:
        src = d.get('source', '')
        nid = d.get('id', '')
        if not src or not nid:
            continue
        stem = src[:-4] if src.endswith('.asy') else src
        result[stem] = nid
    return result


def make_thumb(src_png, dst_webp):
    """Downsample src_png to dst_webp at MAX_DIM px max dimension, quality QUALITY."""
    with Image.open(src_png) as im:
        # Convert palette / grayscale images so WebP encoder is happy
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
        w, h = im.size
        scale = MAX_DIM / max(w, h)
        if scale < 1.0:
            new_size = (max(1, int(round(w * scale))),
                        max(1, int(round(h * scale))))
            im = im.resize(new_size, Image.LANCZOS)
        im.save(dst_webp, 'WEBP', quality=QUALITY, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true',
                    help='Re-encode thumbnails even if they already exist.')
    ap.add_argument('--limit', type=int, default=0,
                    help='Stop after generating N new thumbnails (smoke-test).')
    args = ap.parse_args()

    if not os.path.exists(MANIFEST_PATH):
        sys.exit(f"ERROR: {MANIFEST_PATH} not found. "
                 f"Run build-manifest.py first.")
    if not os.path.exists(BLINK_MANIFEST_PATH):
        sys.exit(f"ERROR: {BLINK_MANIFEST_PATH} not found.")

    os.makedirs(THUMB_DIR, exist_ok=True)

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    records = manifest.get('records', [])

    src_to_numeric = build_source_to_numeric_map()
    print(f"Loaded {len(src_to_numeric)} source->numeric mappings")
    print(f"Scanning {len(records)} library records...")

    generated = 0
    reused = 0
    no_png = 0
    no_map = 0
    errors = 0

    for rec in records:
        rec_id = rec['id']
        thumb_rel = f"library/thumbs/{rec_id}.webp"
        thumb_abs = os.path.join(REPO_ROOT, thumb_rel)

        numeric = src_to_numeric.get(rec_id)
        if not numeric:
            rec['thumb_path'] = None
            no_map += 1
            continue

        src_png = os.path.join(TEXER_PNG_DIR, f"{numeric}.png")
        if not os.path.exists(src_png):
            rec['thumb_path'] = None
            no_png += 1
            continue

        if os.path.exists(thumb_abs) and not args.force:
            rec['thumb_path'] = thumb_rel
            reused += 1
            continue

        try:
            make_thumb(src_png, thumb_abs)
            rec['thumb_path'] = thumb_rel
            generated += 1
            if generated % 500 == 0:
                print(f"  ...generated {generated}")
            if args.limit and generated >= args.limit:
                print(f"  hit --limit {args.limit}; stopping early")
                break
        except Exception as e:
            print(f"  ERROR on {rec_id} ({src_png}): {e}", file=sys.stderr)
            rec['thumb_path'] = None
            errors += 1

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    total_with_thumbs = sum(1 for r in records if r.get('thumb_path'))
    print(f"\n=== Thumbnail summary ===")
    print(f"  newly generated:   {generated}")
    print(f"  reused existing:   {reused}")
    print(f"  no source PNG:     {no_png}")
    print(f"  no blink mapping:  {no_map}")
    print(f"  errors:            {errors}")
    print(f"  records with thumb: {total_with_thumbs}/{len(records)}")

    # Disk footprint
    if generated or reused:
        total_bytes = 0
        n = 0
        for fname in os.listdir(THUMB_DIR):
            if fname.endswith('.webp'):
                total_bytes += os.path.getsize(
                    os.path.join(THUMB_DIR, fname))
                n += 1
        if n:
            print(f"  thumbnail directory: {n} files, "
                  f"{total_bytes / 1024 / 1024:.1f} MB total "
                  f"(avg {total_bytes / n / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
