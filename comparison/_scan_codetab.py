"""Scan asy_src for CODE-LEVEL literal backslash-t (outside strings/comments) and
also code-level literal backslash-n. These are scraper corruption signatures: a
genuine indentation TAB / line break got written as the two chars '\\','t'/'n'.
LaTeX backslash sequences inside string literals (\\theta) are intentionally
ignored. Usage: python comparison/_scan_codetab.py
"""
import os, glob

BS = chr(92)

def code_hits(code):
    """Return (nTabHits, nNlHits) for backslash-t / backslash-n outside strings & comments."""
    i, n = 0, len(code)
    sd = None
    il = ib = False
    nt = nn = 0
    while i < n:
        c = code[i]
        c2 = code[i+1] if i+1 < n else ''
        if sd is not None:
            if c == BS:
                i += 2; continue
            if c == sd:
                sd = None
            i += 1; continue
        if il:
            if c == '\n':
                il = False
            i += 1; continue
        if ib:
            if c == '*' and c2 == '/':
                ib = False; i += 2; continue
            i += 1; continue
        if c == '/' and c2 == '/':
            il = True; i += 1; continue
        if c == '/' and c2 == '*':
            ib = True; i += 2; continue
        if c == '"' or c == "'":
            sd = c; i += 1; continue
        if c == BS and c2 == 't':
            nt += 1; i += 2; continue
        if c == BS and c2 == 'n':
            nn += 1; i += 2; continue
        i += 1
    return nt, nn

if __name__ == '__main__':
    d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'comparison', 'asy_src')
    rows = []
    for f in sorted(glob.glob(os.path.join(d, '*.asy'))):
        t = open(f, encoding='utf-8').read()
        nt, nn = code_hits(t)
        if nt or nn:
            rows.append((os.path.basename(f)[:-4], nt, nn))
    print('affected files:', len(rows))
    print('id,codeTab,codeNl')
    for did, nt, nn in rows:
        print(f'{did},{nt},{nn}')
    print('IDS:', ','.join(r[0] for r in rows))
