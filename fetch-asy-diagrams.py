"""Fetch all Asymptote diagrams from AoPS Redshift for given collection IDs.

Connects to Redshift, fetches scripts and homework for the specified collections,
extracts all [asy]...[/asy] blocks, and saves each as a separate .asy file.
"""

import os
import sys
import re
import json

# Add eigennode scripts to path so we can reuse aops_db
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'eigennode', 'scripts'))

# Load .env from eigennode
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'eigennode', 'scripts', '.env'))

import aops_db

# The collection IDs requested
COLLECTION_IDS = [71, 647, 289, 95, 53, 4, 51, 321, 398, 57, 282, 36, 462, 463, 134, 402, 401, 186, 583, 510, 10, 582]

# Output directory
OUT_DIR = os.path.join(os.path.dirname(__file__), 'asy_corpus')


def unescape_asy(code):
    """Unescape DB escape sequences in ONE [asy] code block, string-aware.

    Converts literal \\n / \\t / \\\\ to real chars OUTSIDE string literals
    (structural line breaks, indentation), but leaves backslash sequences
    INSIDE strings untouched so LaTeX commands like \\theta, \\nu, \\textbf
    survive. A blanket text.replace('\\t','\t') corrupted those into raw
    TAB/NEWLINE chars (e.g. "$\\theta$" -> "$<TAB>heta$").

    Asymptote string literals are delimited by EITHER double OR single quotes
    ('$\\theta$' is just as common on AoPS as "$\\theta$"), and a backslash
    escapes the delimiter (\\' / \\") and itself (\\\\) in both. Single-quoted
    strings must therefore be tracked too, or LaTeX inside them (\\tan, \\rho,
    \\nu, ...) gets mangled into TAB/NEWLINE. Comments are tracked so a stray
    quote in a comment can't toggle string state.
    """
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
    """Extract all [asy]...[/asy] blocks from text.

    Blocks are matched on the RAW DB text, then unescaped per-block so that
    string-state tracking is confined to actual asy code (prose quotes in the
    surrounding post can't leak into a block and swallow its newlines).
    """
    if not text:
        return []
    # Handle the leading ;[asy] BBCode delimiter, but do NOT strip a trailing
    # ; before [/asy]: with the non-greedy .*? that pattern eats the final
    # statement's own terminating semicolon, truncating the block into an
    # "unexpected end of input" compile error (e.g. "draw(...);[/asy]" became
    # "draw(...)"). A stray trailing ; is a harmless empty statement, so
    # keeping it is always safe while stripping it is sometimes fatal.
    pattern = r';?\[asy\](.*?)\[/asy\]'
    matches = re.findall(pattern, text, re.DOTALL)
    return [unescape_asy(m).strip() for m in matches if m.strip()]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Build course defs for the requested collections
    # We don't know the lesson ranges, so we'll query for available lessons
    courses = [{"collection_id": cid, "lessons": list(range(0, 100))} for cid in COLLECTION_IDS]

    conn = aops_db.get_connection()

    # Step 1: Get available lessons for all collections
    print(f"\nFetching data for {len(COLLECTION_IDS)} collections...")
    available = aops_db.bulk_get_available_lessons(conn, COLLECTION_IDS)
    print(f"  Found lessons in {len(available)} collections")
    for cid in sorted(available.keys()):
        print(f"    Collection {cid}: {len(available[cid])} lessons")

    # Step 2: Get script documents
    print("\nFetching script documents...")
    script_docs = aops_db.bulk_get_script_documents(conn, COLLECTION_IDS)
    doc_ids = list(script_docs.values())
    print(f"  Found {len(doc_ids)} script documents")

    # Step 3: Get document versions (line IDs)
    print("Fetching document versions...")
    doc_versions = aops_db.bulk_get_document_versions(conn, doc_ids)

    # Step 4: Get all document lines
    all_line_ids = []
    for dv in doc_versions.values():
        all_line_ids.extend(dv["line_ids"])
    print(f"Fetching {len(all_line_ids)} document lines...")
    all_lines = aops_db.bulk_get_document_lines(conn, all_line_ids)

    # Step 5: Get homework assignments
    print("Fetching homework assignments...")
    hw_assignments = aops_db.bulk_get_homework_assignments(conn, COLLECTION_IDS)

    # Step 6: Get problem versions
    all_problem_ids = list(set(
        a["problem_id"]
        for assignments in hw_assignments.values()
        for a in assignments
    ))
    print(f"Fetching {len(all_problem_ids)} problem versions...")
    problem_versions = aops_db.bulk_get_problem_versions(conn, all_problem_ids)

    conn.close()

    # Now extract all asy blocks
    asy_count = 0
    sources = {}  # track where each diagram came from

    # From scripts
    print("\nExtracting Asymptote diagrams from scripts...")
    for (cid, lesson), doc_id in script_docs.items():
        dv = doc_versions.get(doc_id)
        if not dv:
            continue
        lines = [all_lines.get(lid, '') for lid in dv["line_ids"]]
        full_text = '\n'.join(lines)
        blocks = extract_asy_blocks(full_text)
        for i, block in enumerate(blocks):
            fname = f"c{cid}_L{lesson}_script_{i}.asy"
            fpath = os.path.join(OUT_DIR, fname)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(block)
            asy_count += 1

    print(f"  Found {asy_count} diagrams in scripts")
    script_count = asy_count

    # From homework problems (problem_text, solution_text, hints)
    print("Extracting Asymptote diagrams from homework...")
    for key, assignments in hw_assignments.items():
        cid, lesson = key
        for a in assignments:
            pid = a["problem_id"]
            pv = problem_versions.get(pid, {})
            for field in ['problem_text', 'solution_text', 'hints']:
                text = pv.get(field, '')
                blocks = extract_asy_blocks(text)
                for i, block in enumerate(blocks):
                    fname = f"c{cid}_L{lesson}_p{pid}_{field}_{i}.asy"
                    fpath = os.path.join(OUT_DIR, fname)
                    with open(fpath, 'w', encoding='utf-8') as f:
                        f.write(block)
                    asy_count += 1

    hw_count = asy_count - script_count
    print(f"  Found {hw_count} diagrams in homework")

    print(f"\n=== Total: {asy_count} Asymptote diagrams saved to {OUT_DIR} ===")


if __name__ == '__main__':
    main()
