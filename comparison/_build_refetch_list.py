"""Build the TeXeR-refetch ID list for the \\t-corruption cleanup.

Union of:
  H = April-dated (or missing) previews whose CURRENT source contains an
      in-string backslash-t LaTeX command  -> stale "heta"/"extbf" previews
  C = files that had code-level \\t corruption (marked by a .ctabbak backup),
      now source-fixed -> refetch per user request
  (June-dated heta candidates are excluded: they were already refetched
   during the 2026-06-12 incident and render correctly.)

Writes comparison/_refetch_ids.txt (one id per line) and prints a summary.
"""
import os, glob, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'asy_src')
TEX = os.path.join(HERE, 'texer_pngs')
BS = chr(92)

TCMDS = ('theta', 'textbf', 'textit', 'textrm', 'textsf', 'textsc',
         'textcolor', 'textnormal', 'text', 'times', 'tan', 'tau', 'triangle',
         'therefore', 'tfrac', 'tilde', 'top', 'to', 'td', 'tt')


def instring_tcmds(code):
    i, n = 0, len(code)
    sd = None; il = ib = False
    hits = []
    while i < n:
        c = code[i]; c2 = code[i + 1] if i + 1 < n else ''
        if sd is not None:
            if c == BS:
                if c2 == 't':
                    j = i + 1; w = ''
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


H, C, MISSING = set(), set(), set()
for f in sorted(glob.glob(os.path.join(SRC, '*.asy'))):
    did = os.path.basename(f)[:-4]
    if os.path.exists(f + '.ctabbak'):
        C.add(did)
    code = open(f, encoding='utf-8', errors='replace').read()
    if instring_tcmds(code):
        png = os.path.join(TEX, did + '.png')
        if not os.path.exists(png):
            MISSING.add(did)
        else:
            mon = datetime.datetime.fromtimestamp(os.path.getmtime(png)).strftime('%Y-%m')
            if mon < '2026-06':
                H.add(did)

union = sorted(H | C | MISSING)
with open(os.path.join(HERE, '_refetch_ids.txt'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(union) + '\n')

print(f'H (stale heta, April/missing) : {len(H)}')
print(f'C (code-level fixed, .ctabbak): {len(C)}')
print(f'MISSING preview              : {len(MISSING)}  {sorted(MISSING)}')
print(f'UNION (to refetch)           : {len(union)}')
print(f'  H only: {len(H - C)}   C only: {len(C - H)}   both: {len(H & C)}')
print('written: comparison/_refetch_ids.txt')
