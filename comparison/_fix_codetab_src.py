"""Fix code-level \\t / \\n corruption in asy_src files.

The scraper historically converted real TAB and newline characters used for
code indentation into the two-char sequences '\\','t' / '\\','n'. Asymptote
treats bare '\\' at code level as an invalid token, so these files cannot be
compiled.

This script replaces \\t -> TAB and \\n -> newline ONLY outside of string
literals and comments (using the same state-machine as _scan_codetab.py).

Usage:
    python comparison/_fix_codetab_src.py [--apply] [--ids 00926,08813,...]
    # --apply actually writes files; default is dry-run
"""
import os, glob, shutil, argparse

BS = chr(92)  # backslash

def fix_code(s):
    """Replace \\t->TAB and \\n->newline at code level (outside strings/comments)."""
    out = []
    i, n = 0, len(s)
    sd = None    # string delimiter: '"' or "'"
    il = False   # in line comment (//)
    ib = False   # in block comment (/* ... */)
    cnt_t = cnt_n = 0
    while i < n:
        c = s[i]
        c2 = s[i+1] if i+1 < n else ''

        if sd is not None:           # inside string literal
            if c == BS:              # escape sequence: pass through both chars
                out.append(c)
                if i+1 < n:
                    out.append(s[i+1])
                i += 2
                continue
            if c == sd:              # end of string
                sd = None
            out.append(c); i += 1; continue

        if il:                       # inside // comment
            if c == '\n':
                il = False
            out.append(c); i += 1; continue

        if ib:                       # inside /* */ comment
            if c == '*' and c2 == '/':
                ib = False
                out.append(c); out.append(c2); i += 2; continue
            out.append(c); i += 1; continue

        # ----------- code context -----------
        if c == '/' and c2 == '/':
            il = True; out.append(c); i += 1; continue
        if c == '/' and c2 == '*':
            ib = True; out.append(c); out.append(c2); i += 2; continue
        if c in ('"', "'"):
            sd = c; out.append(c); i += 1; continue

        if c == BS and c2 == 't':
            out.append('\t'); cnt_t += 1; i += 2; continue
        if c == BS and c2 == 'n':
            out.append('\n'); cnt_n += 1; i += 2; continue

        out.append(c); i += 1

    return ''.join(out), cnt_t, cnt_n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='Write fixed files (default: dry-run)')
    ap.add_argument('--ids', type=str, default='',
                    help='Comma-separated list of IDs to process (default: all asy_src)')
    opt = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_dir = os.path.join(root, 'comparison', 'asy_src')

    if opt.ids:
        id_set = set(x.strip() for x in opt.ids.split(',') if x.strip())
        files = sorted(
            os.path.join(src_dir, f'{nid}.asy')
            for nid in id_set
            if os.path.exists(os.path.join(src_dir, f'{nid}.asy'))
        )
    else:
        files = sorted(glob.glob(os.path.join(src_dir, '*.asy')))

    changed = total_t = total_n = 0
    for fpath in files:
        s = open(fpath, encoding='utf-8', errors='replace').read()
        new, ct, cn = fix_code(s)
        if ct == 0 and cn == 0:
            continue
        changed += 1
        total_t += ct; total_n += cn
        rel = os.path.relpath(fpath)
        print(f'  {rel}: {ct} \\t fix(es), {cn} \\n fix(es)')
        if opt.apply:
            bak = fpath + '.ctabbak'
            if not os.path.exists(bak):
                shutil.copy2(fpath, bak)
            with open(fpath, 'w', encoding='utf-8', newline='') as fh:
                fh.write(new)

    label = 'APPLIED' if opt.apply else 'DRY-RUN'
    print(f'\n{label}: {changed} file(s) — {total_t} \\t and {total_n} \\n replacement(s)')


if __name__ == '__main__':
    main()
