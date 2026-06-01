"""Fetch specific .asy sources needed for the 20 low-SSIM diagrams."""
import sys, os, re, json
sys.path.insert(0, 'C:/Users/Mark Eichenlaub/github/eigennode/scripts')
from dotenv import load_dotenv
load_dotenv('C:/Users/Mark Eichenlaub/github/eigennode/scripts/.env')
import aops_db

OUT_DIR = 'C:/Users/Mark Eichenlaub/github/hitexer/comparison/asy_src'

NEEDED = [
    ('02032', 'c186_L19_p31676_problem_text_0.asy'),
    ('12253', 'c647_L14_script_11.asy'),
    ('04532', 'c321_L12_script_15.asy'),
    ('04888', 'c398_L11_script_11.asy'),
    ('04528', 'c321_L12_script_11.asy'),
    ('05944', 'c402_L5_script_1.asy'),
    ('05435', 'c401_L13_p34989_problem_text_0.asy'),
    ('05904', 'c402_L12_script_9.asy'),
    ('03929', 'c268_L11_script_15.asy'),
    ('00641', 'c134_L2_script_9.asy'),
    ('02033', 'c186_L19_p31677_problem_text_0.asy'),
    ('04036', 'c268_L15_p36242_solutiontext_2.asy'),
    ('00145', 'c10_L19_script_20.asy'),
    ('08114', 'c463_L6_p48794_solution_text_4.asy'),
    ('03881', 'c191_L9_script_0.asy'),
    ('04633', 'c36_L10_script_45.asy'),
    ('07865', 'c463_L20_script_12.asy'),
    ('08517', 'c4_L11_p3316_solution_text_0.asy'),
    ('12365', 'c647_L5_script_16.asy'),
    ('03400', 'c190_L1_script_7.asy'),
]

def parse_name(fname):
    fname_base = fname.replace('.asy', '')
    m = re.match(r'c(\d+)_L(\d+)_p(\d+)_(.+)_(\d+)$', fname_base)
    if m:
        return {'type': 'problem', 'cid': int(m.group(1)), 'lesson': int(m.group(2)),
                'pid': int(m.group(3)), 'field': m.group(4), 'idx': int(m.group(5))}
    m = re.match(r'c(\d+)_L(\d+)_script_(\d+)$', fname_base)
    if m:
        return {'type': 'script', 'cid': int(m.group(1)), 'lesson': int(m.group(2)),
                'idx': int(m.group(3))}
    return None

def unescape_asy(code):
    """String-aware unescape of one [asy] block: convert \\n/\\t/\\\\ OUTSIDE
    string literals, but leave backslash sequences inside strings intact so
    LaTeX commands (\\theta, \\nu, \\textbf) survive instead of being turned
    into raw TAB/NEWLINE by a blanket replace. Asymptote strings may be delimited
    by single OR double quotes (and a backslash escapes the delimiter in both),
    so both are tracked; otherwise LaTeX in '$\\tan$' / '$\\rho$' gets mangled."""
    out = []
    i, n = 0, len(code)
    str_delim = None  # None outside strings; otherwise the opening quote char
    in_line = in_block = False
    while i < n:
        c = code[i]
        c2 = code[i + 1] if i + 1 < n else ''
        if str_delim is not None:
            if c == '\\':
                out.append(c)
                if i + 1 < n:
                    out.append(code[i + 1]); i += 2
                else:
                    i += 1
                continue
            if c == str_delim:
                str_delim = None
            out.append(c); i += 1; continue
        # Structural line breaks (\n, \r) expand everywhere outside strings —
        # including inside comments, where a literal \n is what TERMINATES a //
        # line comment. These must run before the comment-copy branches.
        if c == '\\' and c2 == 'n':
            out.append('\n'); i += 2; in_line = False; continue
        if c == '\\' and c2 == 'r':
            # Only a CRLF (\r\n) is a structural break worth expanding. A LONE \r
            # is almost always LaTeX (\rho, \rm, \rightarrow) in a comment/label;
            # expanding it to a bare CR breaks the // comment and makes TeXeR
            # refuse to compile. Leave a lone \r for verbatim copy below.
            if code[i + 2:i + 4] == '\\n':
                out.append('\r'); i += 2; continue
        if c == '\n':
            out.append(c); i += 1; in_line = False; continue
        # Inside a comment, copy verbatim (as inside a string) so a backslash
        # sequence in a commented-out label, e.g. //label("$\theta$"), is NOT
        # mangled into a raw TAB. Only the structural \n/\r above expand here.
        if in_line:
            out.append(c); i += 1; continue
        if in_block:
            if c == '*' and c2 == '/':
                out.append('*/'); i += 2; in_block = False; continue
            out.append(c); i += 1; continue
        # OUTSIDE strings and comments: expand structural \t / \\ (indentation
        # and escaped backslashes that belong to live code, not string content).
        if c == '\\' and c2 == 't':
            out.append('\t'); i += 2; continue
        if c == '\\' and c2 == '\\':
            out.append('\\'); i += 2; continue
        if c == '/' and c2 == '/':
            in_line = True; out.append(c); i += 1; continue
        if c == '/' and c2 == '*':
            in_block = True; out.append(c); i += 1; continue
        if c == '"' or c == "'":
            str_delim = c
        out.append(c); i += 1; continue
    return ''.join(out)

def extract_asy_blocks(text):
    if not text:
        return []
    # Match blocks on raw text, then unescape each block string-aware. Keep the
    # leading ;[asy] delimiter optional, but do NOT strip a trailing ; before
    # [/asy] — the non-greedy .*? would eat the final statement's terminating
    # semicolon and truncate the block ("unexpected end of input").
    return [unescape_asy(m).strip() for m in re.findall(r';?\[asy\](.*?)\[/asy\]', text, re.DOTALL) if m.strip()]

# Field name normalization
FIELD_MAP = {
    'solutiontext': 'solution_text',
    'problemtext': 'problem_text',
}

parsed = [(did, fname, parse_name(fname)) for did, fname in NEEDED]
collection_ids = set()
script_keys = set()
problem_ids = set()
for did, fname, p in parsed:
    if p:
        collection_ids.add(p['cid'])
        if p['type'] == 'script':
            script_keys.add((p['cid'], p['lesson']))
        else:
            problem_ids.add(p['pid'])

print(f"Collections: {sorted(collection_ids)}")
print(f"Script keys: {sorted(script_keys)}")
print(f"Problem IDs: {sorted(problem_ids)}")

conn = aops_db.get_connection()

print("\nFetching script documents...")
script_docs = aops_db.bulk_get_script_documents(conn, list(collection_ids))
needed_docs = {k: v for k, v in script_docs.items() if k in script_keys}
print(f"  Got {len(needed_docs)} of {len(script_keys)} needed")

doc_ids = list(needed_docs.values())
doc_versions = aops_db.bulk_get_document_versions(conn, doc_ids)
all_line_ids = [lid for dv in doc_versions.values() for lid in dv['line_ids']]
print(f"Fetching {len(all_line_ids)} lines...")
all_lines = aops_db.bulk_get_document_lines(conn, all_line_ids)

print(f"\nFetching {len(problem_ids)} problem versions...")
problem_versions = aops_db.bulk_get_problem_versions(conn, list(problem_ids))
print(f"  Got {len(problem_versions)} versions")
conn.close()

saved = 0
failed = 0
for did, fname, p in parsed:
    if p is None:
        print(f"  FAIL {did}: can't parse {fname}")
        failed += 1
        continue
    out_path = os.path.join(OUT_DIR, f"{did}.asy")
    if os.path.exists(out_path):
        print(f"  SKIP {did}: already exists")
        continue
    code = None
    if p['type'] == 'script':
        key = (p['cid'], p['lesson'])
        doc_id = needed_docs.get(key)
        if not doc_id:
            print(f"  FAIL {did} ({fname}): no doc for {key}")
            failed += 1
            continue
        dv = doc_versions.get(doc_id)
        if not dv:
            print(f"  FAIL {did}: no version for doc {doc_id}")
            failed += 1
            continue
        lines = [str(all_lines.get(lid, '')) for lid in dv['line_ids']]
        blocks = extract_asy_blocks('\n'.join(lines))
        if p['idx'] < len(blocks):
            code = blocks[p['idx']]
        else:
            print(f"  FAIL {did} ({fname}): idx {p['idx']} >= {len(blocks)} blocks")
            failed += 1
            continue
    else:  # problem
        pv = problem_versions.get(p['pid'])
        if not pv:
            print(f"  FAIL {did}: no version for problem {p['pid']}")
            failed += 1
            continue
        field = FIELD_MAP.get(p['field'], p['field'])
        text = pv.get(field, '')
        if not text:
            print(f"  FAIL {did}: field {field!r} empty, keys={list(pv.keys())}")
            failed += 1
            continue
        blocks = extract_asy_blocks(text)
        if p['idx'] < len(blocks):
            code = blocks[p['idx']]
        else:
            print(f"  FAIL {did}: idx {p['idx']} >= {len(blocks)} blocks")
            failed += 1
            continue
    if code:
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"  SAVED {did}: {len(code)} chars")
        saved += 1
    else:
        print(f"  FAIL {did}: empty code")
        failed += 1

print(f"\nTotal: {saved} saved, {failed} failed")
