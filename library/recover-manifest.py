"""Salvage tags from a truncated manifest.json.

The tag-batch run died mid-write and left manifest.json truncated inside a
string. This script walks the file character-by-character tracking JSON
nesting, finds the last complete record object inside the records[] array,
truncates there, closes the outer array + object, and writes the file back.

The goal is to recover the ~1,557 successfully-tagged entries written before
the catastrophe, and to wipe the ~4,500 garbage `_error` entries that
followed (so the next tagging pass treats them as untagged and re-attempts
them with the fixed pipeline).

Writes the recovered manifest to library/manifest.json (after backup to
library/manifest.json.corrupted).
"""
import json
import os
import shutil
import sys


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json')
BACKUP_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json.corrupted')


def find_last_complete_record(text):
    """Walk the JSON tracking depth and string state. Return the byte
    offset of the last position where depth==2 (inside records[] array,
    between records) and we just finished a record object."""
    depth = 0
    in_string = False
    escape = False
    last_safe_offset = None
    in_records_array = False
    records_array_depth = None

    # Find the "records": [ start so we know which depth corresponds to
    # "between records".
    rec_key = '"records"'
    rk_idx = text.find(rec_key)
    if rk_idx < 0:
        raise SystemExit("No \"records\" key found in manifest")

    # Scan from start so depth tracking is correct
    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == '{' or ch == '[':
            depth += 1
            if not in_records_array and ch == '[' and i > rk_idx and records_array_depth is None:
                # First '[' after "records":
                in_records_array = True
                records_array_depth = depth  # depth inside the array
        elif ch == '}' or ch == ']':
            depth -= 1
            if in_records_array and depth == records_array_depth - 1:
                # We just closed the records array (shouldn't happen
                # in a truncated file, but handle it).
                break
            if in_records_array and depth == records_array_depth and ch == '}':
                # Just finished one record. Safe to truncate AFTER this
                # closing brace (the position right after this char).
                last_safe_offset = i + 1

    return last_safe_offset


def main():
    if not os.path.exists(MANIFEST_PATH):
        sys.exit(f"ERROR: {MANIFEST_PATH} not found")

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        text = f.read()

    # Verify it's actually broken
    try:
        json.loads(text)
        print("manifest.json parses cleanly already; nothing to recover.")
        return
    except json.JSONDecodeError as e:
        print(f"Detected corruption: {e}")

    print(f"File size: {len(text):,} chars")
    offset = find_last_complete_record(text)
    if offset is None:
        sys.exit("Could not find any complete record")
    print(f"Last complete record ends at offset {offset:,}")

    # Backup the corrupted file
    if not os.path.exists(BACKUP_PATH):
        shutil.copy2(MANIFEST_PATH, BACKUP_PATH)
        print(f"Backed up corrupted file to {BACKUP_PATH}")

    # Truncate to that offset, then close the records[] and outer object.
    salvaged = text[:offset] + '\n  ]\n}\n'

    # Parse to verify
    obj = json.loads(salvaged)
    n = len(obj['records'])
    print(f"Salvaged {n:,} complete records")

    # Wipe `tags` fields that contain `_error` so they re-attempt later
    n_ok = 0
    n_err_wiped = 0
    n_no_tags = 0
    for r in obj['records']:
        t = r.get('tags')
        if not t:
            n_no_tags += 1
            continue
        if isinstance(t, dict) and '_error' in t:
            r.pop('tags', None)
            n_err_wiped += 1
        else:
            n_ok += 1

    print(f"  ok tag entries kept: {n_ok}")
    print(f"  error entries wiped: {n_err_wiped}")
    print(f"  records with no tags: {n_no_tags}")

    # Atomic write
    tmp = MANIFEST_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    os.replace(tmp, MANIFEST_PATH)
    print(f"Wrote recovered manifest to {MANIFEST_PATH}")


if __name__ == '__main__':
    main()
