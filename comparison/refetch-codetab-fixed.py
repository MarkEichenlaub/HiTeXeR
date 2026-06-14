"""
Re-fetch TeXeR PNGs for all code-tab-fixed diagram IDs (those with a
.ctabbak backup in asy_src/), then update the corpus backup for any PNGs
that actually changed.

Steps:
  1. Discover IDs from *.ctabbak files in asy_src/
  2. Record SHA-256 of every current texer PNG (pre-fetch baseline)
  3. Call refetch-rerender-recompute.js --ids ... to:
       a. re-fetch fresh PNGs from TeXeR (cache-busted, rate-limit-aware)
       b. re-render with HiTeXeR and recompute SSIM
       c. update ssim-results.json + manifest
  4. Compare new hashes with baseline; for any that changed, copy to backup
  5. Print summary

Usage:
    python comparison/refetch-codetab-fixed.py [--workers N] [--backup PATH]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
ASY_SRC = ROOT / "comparison" / "asy_src"
TEXER = ROOT / "comparison" / "texer_pngs"
DEFAULT_BACKUP_BASE = Path(r"C:\Users\Mark Eichenlaub\github\hitexer-corpus-backup")


def file_hash(p: Path):
    """SHA-256 of file, or None if missing."""
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()
    except FileNotFoundError:
        return None


def find_backup(base: Path) -> Path:
    """Return the most-recent dated snapshot dir."""
    snapshots = sorted(d for d in base.iterdir() if d.is_dir())
    if not snapshots:
        raise RuntimeError(f"No snapshot dirs in {base}")
    return snapshots[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=3, help="Parallel TeXeR fetch workers")
    ap.add_argument("--backup", type=str, default=str(DEFAULT_BACKUP_BASE),
                    help="Path to hitexer-corpus-backup base directory")
    opt = ap.parse_args()

    backup_base = Path(opt.backup)
    backup = find_backup(backup_base)
    backup_texer = backup / "texer_pngs"
    print(f"Backup snapshot: {backup}")

    # ── Step 1: discover IDs ──
    ids = sorted(
        p.name.replace(".asy.ctabbak", "")
        for p in ASY_SRC.glob("*.ctabbak")
    )
    if not ids:
        print("No .ctabbak files found — nothing to do.")
        return
    print(f"Found {len(ids)} code-tab-fixed IDs to refetch")

    # ── Step 2: pre-fetch hashes ──
    print("Recording pre-fetch hashes …")
    pre = {id_: file_hash(TEXER / f"{id_}.png") for id_ in ids}
    pre_missing = sum(1 for h in pre.values() if h is None)
    if pre_missing:
        print(f"  {pre_missing} ids have no current texer PNG (will be treated as new)")

    # ── Step 3: refetch + rescore via refetch-rerender-recompute.js ──
    ids_str = ",".join(ids)
    cmd = [
        "node",
        str(ROOT / "comparison" / "refetch-rerender-recompute.js"),
        "--ids", ids_str,
        "--workers", str(opt.workers),
    ]
    print(f"\nRunning refetch-rerender-recompute.js ({len(ids)} ids, {opt.workers} workers) …")
    print("  (this will take a while — rate-limit-aware)\n")
    ret = subprocess.run(cmd, cwd=ROOT)
    if ret.returncode != 0:
        print(f"\nWARNING: refetch-rerender-recompute.js exited with code {ret.returncode}")
        print("Continuing with backup update for whatever was fetched …")

    # ── Step 4: compare hashes, update backup ──
    print("\nComparing new texer PNGs with pre-fetch baseline …")
    changed, skipped_same, skipped_missing = [], [], []

    for id_ in ids:
        cur_path = TEXER / f"{id_}.png"
        bak_path = backup_texer / f"{id_}.png"
        new_hash = file_hash(cur_path)

        if new_hash is None:
            # Fetch failed (or compile error) — no PNG written
            skipped_missing.append(id_)
            continue

        if new_hash == pre[id_]:
            # TeXeR returned an identical image — no change
            skipped_same.append(id_)
            continue

        # PNG changed (or was newly created) — update backup
        changed.append(id_)
        bak_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cur_path, bak_path)

    # ── Step 5: summary ──
    print(f"\n{'='*60}")
    print(f"DONE")
    print(f"  Changed (backup updated): {len(changed)}")
    print(f"  Unchanged (same image):   {len(skipped_same)}")
    print(f"  Missing (fetch failed):   {len(skipped_missing)}")
    if changed:
        print(f"\nChanged IDs ({len(changed)}): {', '.join(changed[:30])}" +
              (f" … (+{len(changed)-30} more)" if len(changed) > 30 else ""))
    if skipped_missing:
        print(f"\nFailed IDs ({len(skipped_missing)}): {', '.join(skipped_missing[:30])}" +
              (f" … (+{len(skipped_missing)-30} more)" if len(skipped_missing) > 30 else ""))

    # Write a summary JSON for review
    summary = {
        "total": len(ids),
        "changed": changed,
        "unchanged_same": skipped_same,
        "fetch_failed": skipped_missing,
        "backup": str(backup),
    }
    out = ROOT / "comparison" / "refetch-codetab-summary.json"
    out.write_text(json.dumps(summary, indent=2))
    print(f"\nSummary written to {out}")


if __name__ == "__main__":
    main()
