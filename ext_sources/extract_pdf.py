"""
extract_pdf.py <pdf> <source-tag> <outdir>

Extract Asymptote code examples from a LaTeX-made tutorial PDF by FONT: code
listings are typewriter (CMTT/SFTT/mono), prose is roman. We keep only multi-line
monospace blocks (so inline `code` mentions inside prose are excluded), then keep
blocks that contain a real drawing statement. Downstream TeXeR fetch drops any
that don't compile.
"""
import sys, re, os
import fitz  # PyMuPDF

PDF, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

STMT_RE = re.compile(
    r'^\s*(?:pen\s+\w+\s*=\s*)?'
    r'(?:draw|filldraw|fill|label|dot|shipout|add|attach|markangle|markrightangle|'
    r'axes|xaxis|yaxis)\s*\(', re.M)
BAD_RE = re.compile(r'(import\s+animation|import\s+animate|embed\s*\(|settings\s*\.|'
                    r'while\s*\(\s*true\s*\)|\binput\s*\(|\baccess\s+)')

def is_example(code):
    if not (12 <= len(code) <= 4000): return False
    if not STMT_RE.search(code): return False
    if BAD_RE.search(code): return False
    return ';' in code

def is_mono(font):
    f = font.lower()
    return ('tt' in f) or ('mono' in f) or ('courier' in f) or ('type' in f)

doc = fitz.open(PDF)
code_lines = []  # (page, y0, y1, text)
for pno in range(doc.page_count):
    d = doc[pno].get_text("dict")
    for b in d["blocks"]:
        for l in b.get("lines", []):
            spans = l.get("spans", [])
            if not spans: continue
            total = sum(len(s["text"].strip()) for s in spans)
            mono  = sum(len(s["text"].strip()) for s in spans if is_mono(s["font"]))
            if total == 0 or mono/total < 0.6: continue
            text = "".join(s["text"] for s in spans).rstrip()
            if not text.strip(): continue
            x0, y0, x1, y1 = l["bbox"]
            code_lines.append((pno, y0, y1, text))

# group consecutive code lines into blocks
blocks, cur, last = [], [], None
for cl in code_lines:
    pno, y0, y1, text = cl
    if last and pno == last[0] and (y0 - last[2]) < 7:
        cur.append(text)
    else:
        if cur: blocks.append(cur)
        cur = [text]
    last = cl
if cur: blocks.append(cur)

seen, n = set(), 0
for blk in blocks:
    code = "\n".join(blk).replace(" ", " ").rstrip()
    # normalize common PDF artifacts
    code = code.replace("ﬁ", "fi").replace("ﬂ", "fl")
    if not is_example(code): continue
    norm = re.sub(r"\s+", " ", code).strip()
    if norm in seen: continue
    seen.add(norm)
    n += 1
    with open(os.path.join(OUT, f"ext_{SRC}_{n:03d}.asy"), "w", encoding="utf-8") as fh:
        fh.write(code + "\n")
print(f"{SRC}: {len(blocks)} mono blocks → {n} example(s)")
