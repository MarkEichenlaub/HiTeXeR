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

def extract_asy_blocks(text):
    """Extract all [asy]...[/asy] blocks from text, expanding escape sequences."""
    if not text:
        return []
    # Expand literal \n to real newlines (Redshift stores them escaped)
    expanded = text.replace('\\n', '\n')
    blocks = []
    for m in re.finditer(r'\[asy\](.*?)\[/asy\]', expanded, re.DOTALL):
        code = m.group(1).strip()
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
