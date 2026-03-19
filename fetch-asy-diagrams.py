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


def unescape_db_text(text):
    """Unescape literal \\n, \\t, etc. from database text."""
    if not text:
        return text
    # Replace literal \n with newline, \t with tab, etc.
    text = text.replace('\\n', '\n').replace('\\t', '\t').replace('\\\\', '\\')
    return text


def extract_asy_blocks(text):
    """Extract all [asy]...[/asy] blocks from text."""
    if not text:
        return []
    text = unescape_db_text(text)
    # Handle both [asy]...[/asy] and ;[asy]...;[/asy] BBCode variants
    pattern = r';?\[asy\](.*?);?\[/asy\]'
    matches = re.findall(pattern, text, re.DOTALL)
    return [m.strip() for m in matches if m.strip()]


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
