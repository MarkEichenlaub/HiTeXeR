"""One-off cleanup of residual \\t corruption left by the OLD scraper.

A raw TAB inside a double-quoted string literal is never legitimate asy — it is
the signature of the historical bug where a blanket replace turned the backslash
sequence in e.g. "$\\theta$" into "$<TAB>heta$". The scraper is now fixed
(string- and comment-aware), so this just cleans the files that predate the fix.

For every TAB that sits inside a "..." string literal, restore it to the literal
two characters backslash-t. Backups are written next to the originals as
<name>.asy.tabbak before any file is modified.
"""
import glob, os, shutil, sys

B = '\\'
TAB = '\t'

def repair(s):
    """Replace in-string TABs with literal backslash-t. Returns (new, count)."""
    out = []
    instr = esc = False
    cnt = 0
    for c in s:
        if instr:
            if esc:
                out.append(c); esc = False; continue
            if c == B:
                out.append(c); esc = True; continue
            if c == '"':
                out.append(c); instr = False; continue
            if c == TAB:
                out.append(B); out.append('t'); cnt += 1; continue
            out.append(c); continue
        if c == '"':
            instr = True
        out.append(c)
    return ''.join(out), cnt

def run(dirs, apply):
    total_files = total_tabs = 0
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, '*.asy'))):
            s = open(f, encoding='utf-8', errors='replace').read()
            new, cnt = repair(s)
            if cnt:
                total_files += 1; total_tabs += cnt
                print(f'  {os.path.relpath(f)}: {cnt} in-string TAB(s)')
                if apply:
                    shutil.copy2(f, f + '.tabbak')
                    with open(f, 'w', encoding='utf-8', newline='') as fh:
                        fh.write(new)
    print(f'{"REPAIRED" if apply else "WOULD REPAIR"}: {total_files} files, {total_tabs} tabs')

if __name__ == '__main__':
    apply = '--apply' in sys.argv
    run(['comparison/asy_src', 'asy_corpus'], apply)
