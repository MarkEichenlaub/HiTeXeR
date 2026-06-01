"""
Fetch all Asymptote diagrams from AoPS physics courses via Redshift.
Uses eigennode's aops_db module for database access.

Usage: python comparison/fetch-physics-asy.py
"""
import sys, os, re

# Add eigennode scripts to path
EIGENNODE_SCRIPTS = os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts')
sys.path.insert(0, EIGENNODE_SCRIPTS)

# Load .env from eigennode/scripts
from dotenv import load_dotenv
load_dotenv(os.path.join(EIGENNODE_SCRIPTS, '.env'))

from aops_db import get_connection, PHYSICS_COURSES, fetch_all_course_data

CORPUS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'asy_corpus')

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
    """Extract all [asy]...[/asy] blocks from text, expanding escape sequences.

    Blocks are matched on the raw text then unescaped per-block (string-aware)
    so LaTeX label commands survive and prose quotes can't corrupt a block.
    """
    if not text:
        return []
    blocks = []
    for m in re.finditer(r'\[asy\](.*?)\[/asy\]', text, re.DOTALL):
        code = unescape_asy(m.group(1)).strip()
        if code:
            blocks.append(code)
    return blocks

def safe_sort_key(item):
    k = item[0]
    return (k[0] or 0, k[1] or 0)

def main():
    conn = get_connection()
    print(f"Fetching data for {len(PHYSICS_COURSES)} physics courses...")
    data = fetch_all_course_data(conn, PHYSICS_COURSES)
    conn.close()

    total = 0
    written = 0
    skipped = 0

    # Extract from scripts
    print("\nExtracting from scripts...")
    script_idx = {}  # per-(coll_id, lesson) counter
    for (coll_id, lesson), lines in sorted(data.get('script_lines', {}).items(), key=safe_sort_key):
        if coll_id is None or lesson is None:
            continue
        key = (coll_id, lesson)
        for line in lines:
            blocks = extract_asy_blocks(line)
            for code in blocks:
                total += 1
                idx = script_idx.get(key, 0)
                script_idx[key] = idx + 1
                filename = f"c{coll_id}_L{lesson}_script_{idx}.asy"
                filepath = os.path.join(CORPUS_DIR, filename)
                if not os.path.exists(filepath):
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(code)
                    written += 1
                else:
                    skipped += 1

    # Extract from homework problems
    print("Extracting from homework...")
    for (coll_id, lesson), problems in sorted(data.get('homework', {}).items(), key=safe_sort_key):
        if coll_id is None or lesson is None:
            continue
        for problem in problems:
            pid = problem.get('problem_id', 0)
            for field_name in ['problem_text', 'solution_text', 'hints']:
                content = problem.get(field_name, '')
                blocks = extract_asy_blocks(content)
                for block_idx, code in enumerate(blocks):
                    total += 1
                    safe_field = field_name.replace('_', '')
                    filename = f"c{coll_id}_L{lesson}_p{pid}_{safe_field}_{block_idx}.asy"
                    filepath = os.path.join(CORPUS_DIR, filename)
                    if not os.path.exists(filepath):
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(code)
                        written += 1
                    else:
                        skipped += 1

    print(f"\nDone: {total} asy blocks found, {written} new files written, {skipped} already existed")
    print(f"\nCourse summary:")
    for c in PHYSICS_COURSES:
        cid = c['collection_id']
        count = len([f for f in os.listdir(CORPUS_DIR) if f.startswith(f"c{cid}_")])
        print(f"  {c['name']} (c{cid}): {count} diagrams")

if __name__ == '__main__':
    main()
