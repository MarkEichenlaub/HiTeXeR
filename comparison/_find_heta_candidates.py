"""Find diagrams whose CURRENT (corrected) source contains an in-string LaTeX
command beginning with backslash-t (\\theta, \\textbf, \\times, \\tan, ...).
These are the ONLY diagrams whose TeXeR preview could show the historic
"heta"/"extbf" corruption (a TAB ate the 't').  Joins each with its
texer_png mtime so the oldest (most likely still-stale) float to the top.

Usage: python comparison/_find_heta_candidates.py
"""
import os, glob, datetime

BS = chr(92)
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'asy_src')
TEX = os.path.join(HERE, 'texer_pngs')

# backslash-t LaTeX commands that, if the 't' were eaten by a TAB, render as a
# recognisable wrong token.  We only need the leading-'t' ones.
TCMDS = ('theta', 'textbf', 'textit', 'textrm', 'textsf', 'textsc',
         'textcolor', 'text', 'times', 'tan', 'tau', 'triangle', 'therefore',
         'tfrac', 'tilde', 'top', 'to', 'td', 'tt')

def instring_tcmds(code):
    """Return list of in-string backslash-t LaTeX commands found."""
    i, n = 0, len(code)
    sd = None; il = ib = False
    hits = []
    while i < n:
        c = code[i]; c2 = code[i+1] if i+1 < n else ''
        if sd is not None:
            if c == BS:
                # escape inside string: look at what follows the backslash
                if c2 == 't':
                    # backslash-t-...  grab the command word
                    j = i+1; w = ''
                    while j < n and code[j].isalpha():
                        w += code[j]; j += 1
                    if any(w == t or w.startswith(t) for t in TCMDS):
                        hits.append(w)
                i += 2; continue
            if c == sd:
                sd = None
            i += 1; continue
        if il:
            if c == '\n': il = False
            i += 1; continue
        if ib:
            if c == '*' and c2 == '/': ib = False; i += 2; continue
            i += 1; continue
        if c == '/' and c2 == '/': il = True; i += 1; continue
        if c == '/' and c2 == '*': ib = True; i += 2; continue
        if c in ('"', "'"): sd = c; i += 1; continue
        i += 1
    return hits

rows = []
for f in sorted(glob.glob(os.path.join(SRC, '*.asy'))):
    did = os.path.basename(f)[:-4]
    code = open(f, encoding='utf-8', errors='replace').read()
    hits = instring_tcmds(code)
    if not hits:
        continue
    png = os.path.join(TEX, did + '.png')
    mt = os.path.getmtime(png) if os.path.exists(png) else 0
    rows.append((did, mt, hits))

rows.sort(key=lambda r: r[1])
print(f'candidates (source has in-string backslash-t LaTeX): {len(rows)}')
# month histogram
from collections import Counter
hist = Counter(datetime.datetime.fromtimestamp(mt).strftime('%Y-%m') if mt else 'MISSING' for _, mt, _ in rows)
print('texer_png mtime months:', dict(sorted(hist.items())))
print('\n--- oldest 40 candidates ---')
for did, mt, hits in rows[:40]:
    ds = datetime.datetime.fromtimestamp(mt).strftime('%Y-%m-%d') if mt else 'MISSING'
    print(f'{did}  {ds}  {",".join(sorted(set(hits)))}')
