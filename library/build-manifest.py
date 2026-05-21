"""Build library/manifest.json from AoPS Redshift data.

For each [asy]...[/asy] block in the listed collections' scripts and
problem texts, emit a record containing:
  - id                  matches the existing asy_corpus filename stem
  - collection_id       AoPS course/collection ID
  - collection_name     human-readable course name (looked up from redshift)
  - lesson              lesson number
  - lesson_title        from the script document version name
  - source_kind         "script" | "problem_text" | "solution_text" | "hints"
  - problem_id          AoPS problem ID, or null for script-sourced diagrams
  - asy_path            repo-relative path to the .asy file in asy_corpus/
  - context_before      ~300 chars of prose immediately preceding [asy]
  - context_after       ~300 chars of prose immediately following [/asy]

Context is BBCode-stripped (so tags like [b] [hide] [url] are removed)
but TeX math delimiters are preserved. Context windows are clamped at
adjacent [asy] blocks so a diagram's context never contains another
diagram's code.

Does NOT rewrite any .asy files; only consumes asy_corpus/.
"""

import os
import sys
import re
import json
import datetime

# Reuse the EigenNode aops_db module (same pattern as fetch-asy-diagrams.py)
sys.path.insert(0, os.path.join(
    os.path.dirname(__file__), '..', '..', 'eigennode', 'scripts'))

from dotenv import load_dotenv
load_dotenv(os.path.join(
    os.path.dirname(__file__), '..', '..', 'eigennode', 'scripts', '.env'))

import aops_db


COLLECTION_IDS = [
    # Math courses
    71, 647, 289, 95, 53, 4, 51, 321, 398, 57, 282, 36,
    462, 463, 134, 402, 401, 186, 583, 510, 10, 582,
    # Physics courses (asy files already in corpus from comparison/fetch-physics-asy.py)
    175, 190, 191, 268, 400, 405, 539,
]


# Hand-curated human-readable names. The redshift `name` column holds
# internal codes ("WL Calc", "SP Geo", blanks). These are derived from
# the course_id slug and the "Art of Problem Solving's <X>" doc-request
# template text in aops3.crypt_collections.
COLLECTION_NAMES_OVERRIDE = {
    4:   "AIME Problem Series B",
    10:  "Calculus",
    36:  "MATHCOUNTS/AMC 8 Advanced",
    51:  "Intermediate Number Theory",
    53:  "Intermediate Counting and Probability",
    57:  "Introduction to Geometry",
    71:  "ChemWOOT",
    95:  "Intermediate Algebra",
    134: "Olympiad Geometry",
    175: "PhysicsWOOT (FizzWOOT, even-year rotation)",
    186: "Precalculus",
    190: "F=ma Problem Series",
    191: "PhysicsWOOT (FizzWOOT, odd-year rotation)",
    268: "Introduction to Physics",
    282: "Introduction to Number Theory",
    289: "Group Theory",
    321: "Introduction to Algebra A",
    398: "Introduction to Algebra B",
    400: "Physics Seminar: Relativity",
    401: "Prealgebra 2",
    402: "Prealgebra 1",
    405: "Physics 1: Mechanics",
    462: "MathWOOT 1",
    463: "MathWOOT 2",
    510: "USACO Silver",
    539: "Middle School Physics 1",
    540: "Middle School Physics 2",
    582: "Introduction to Geometry (Self-Paced)",
    583: "USACO Bronze",
    647: "CodeWOOT",
}

CONTEXT_BEFORE = 300
CONTEXT_AFTER = 300

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASY_DIR = os.path.join(REPO_ROOT, 'asy_corpus')
OUT_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json')


# ---------------------------------------------------------------------------
# Collection-name discovery
# ---------------------------------------------------------------------------

def get_collection_names(conn, collection_ids):
    """Look up collection (course) names.

    Strategy: pull whatever is in `aops3.crypt_collections.name`, then
    overlay our hand-curated COLLECTION_NAMES_OVERRIDE so cryptic codes
    like "WL Calc" become "Calculus".
    """
    if not collection_ids:
        return {}

    result = _fetch_redshift_names(conn, collection_ids)
    for cid in collection_ids:
        if cid in COLLECTION_NAMES_OVERRIDE:
            result[cid] = COLLECTION_NAMES_OVERRIDE[cid]
        else:
            result.setdefault(cid, f"Collection {cid}")
    return result


def _fetch_redshift_names(conn, collection_ids):
    """Probe information_schema for the right name column and pull it.
    Returns whatever redshift reports; may be empty for some IDs."""
    if not collection_ids:
        return {}

    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'aops3'
              AND table_name LIKE 'crypt_collection%'
        """)
        tables = sorted({r[0] for r in cur.fetchall()})

    # Prefer a singular-ish "crypt_collections" table; skip the link tables
    # (crypt_collections_documents, crypt_collections_problems).
    skip = {'crypt_collections_documents', 'crypt_collections_problems'}
    candidates = [t for t in tables if t not in skip]
    if not candidates:
        print(f"  WARNING: no candidate collections table found "
              f"(saw: {tables})", file=sys.stderr)
        return {cid: f"Collection {cid}" for cid in collection_ids}

    for table in candidates:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'aops3' AND table_name = %s
            """, (table,))
            cols = {r[0] for r in cur.fetchall()}
        if 'collection_id' not in cols:
            continue
        name_col = next((c for c in
                         ('name', 'title', 'collection_name', 'display_name')
                         if c in cols), None)
        if not name_col:
            print(f"  note: aops3.{table} has no name-like column "
                  f"(cols: {sorted(cols)})", file=sys.stderr)
            continue

        placeholders = ','.join(['%s'] * len(collection_ids))
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT collection_id, {name_col}
                FROM aops3.{table}
                WHERE collection_id IN ({placeholders})
            """, collection_ids)
            result = {cid: name for cid, name in cur.fetchall()}
        print(f"  resolved {len(result)} collection names from "
              f"aops3.{table}.{name_col}")
        # Fill in any missing ones with a placeholder
        for cid in collection_ids:
            result.setdefault(cid, f"Collection {cid}")
        return result

    print("  WARNING: no usable collections table found; using IDs only",
          file=sys.stderr)
    return {cid: f"Collection {cid}" for cid in collection_ids}


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def unescape_db_text(text):
    """Unescape literal \\n, \\t, \\\\ from database text."""
    if not text:
        return text
    return (text.replace('\\n', '\n')
                .replace('\\t', '\t')
                .replace('\\\\', '\\'))


# Drop [hide]...[/hide] spoiler/solution blocks entirely (their inner text
# is usually a duplicate solution and clutters the context).
HIDE_RE = re.compile(r'\[hide(?:=[^\]]*)?\].*?\[/hide\]',
                     re.DOTALL | re.IGNORECASE)

# Match any other BBCode opener or closer (but [asy]/[/asy] is consumed
# separately before this runs).
BBCODE_TAG_RE = re.compile(r'\[/?[a-zA-Z][a-zA-Z0-9_]*(?:=[^\]]*)?\]')

WS_RE = re.compile(r'\s+')


def strip_bbcode(text):
    """Remove BBCode tags from text; preserve TeX math delimiters as-is."""
    if not text:
        return ""
    text = HIDE_RE.sub('', text)
    text = BBCODE_TAG_RE.sub('', text)
    text = WS_RE.sub(' ', text).strip()
    return text


ASY_BLOCK_RE = re.compile(r';?\[asy\](.*?);?\[/asy\]', re.DOTALL)


def extract_blocks_with_context(text,
                                before=CONTEXT_BEFORE,
                                after=CONTEXT_AFTER):
    """Find all [asy]...[/asy] blocks in `text`.

    Returns a list of dicts: {asy, context_before, context_after}.
    Context windows are clamped at adjacent [asy] block boundaries so the
    code from one diagram never appears in another's context.
    """
    if not text:
        return []
    text = unescape_db_text(text)
    matches = list(ASY_BLOCK_RE.finditer(text))
    blocks = []
    for i, m in enumerate(matches):
        body = m.group(1).strip()
        if not body:
            continue
        prev_end = matches[i - 1].end() if i > 0 else 0
        next_start = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        raw_before = text[max(prev_end, m.start() - before):m.start()]
        raw_after = text[m.end():min(next_start, m.end() + after)]
        blocks.append({
            "asy": body,
            "context_before": strip_bbcode(raw_before),
            "context_after": strip_bbcode(raw_after),
        })
    return blocks


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    conn = aops_db.get_connection()

    print("Fetching collection names...")
    coll_names = get_collection_names(conn, COLLECTION_IDS)

    print("Fetching script documents and lesson titles...")
    script_docs = aops_db.bulk_get_script_documents(conn, COLLECTION_IDS)
    doc_versions = aops_db.bulk_get_document_versions(
        conn, list(script_docs.values()))

    lesson_titles = {}
    for (cid, lesson), doc_id in script_docs.items():
        dv = doc_versions.get(doc_id)
        if dv:
            lesson_titles[(cid, lesson)] = dv.get("name")

    all_line_ids = []
    for dv in doc_versions.values():
        all_line_ids.extend(dv["line_ids"])
    print(f"Fetching {len(all_line_ids)} document lines...")
    all_lines = aops_db.bulk_get_document_lines(conn, all_line_ids)

    print("Fetching homework assignments...")
    hw_assignments = aops_db.bulk_get_homework_assignments(
        conn, COLLECTION_IDS)
    all_problem_ids = list({a["problem_id"]
                            for assignments in hw_assignments.values()
                            for a in assignments})
    print(f"Fetching {len(all_problem_ids)} problem versions...")
    problem_versions = aops_db.bulk_get_problem_versions(
        conn, all_problem_ids)

    conn.close()

    records = []
    missing_asy = 0
    empty_blocks = 0

    print("\nExtracting from scripts...")
    for (cid, lesson), doc_id in script_docs.items():
        dv = doc_versions.get(doc_id)
        if not dv:
            continue
        full_text = '\n'.join(all_lines.get(lid, '') for lid in dv["line_ids"])
        blocks = extract_blocks_with_context(full_text)
        for i, blk in enumerate(blocks):
            rec_id = f"c{cid}_L{lesson}_script_{i}"
            asy_rel = f"asy_corpus/{rec_id}.asy"
            if not os.path.exists(os.path.join(REPO_ROOT, asy_rel)):
                missing_asy += 1
                continue
            records.append({
                "id": rec_id,
                "collection_id": cid,
                "collection_name": coll_names.get(cid, f"Collection {cid}"),
                "lesson": lesson,
                "lesson_title": lesson_titles.get((cid, lesson)),
                "source_kind": "script",
                "problem_id": None,
                "asy_path": asy_rel,
                "context_before": blk["context_before"],
                "context_after": blk["context_after"],
            })

    print("Extracting from homework...")
    for (cid, lesson), assignments in hw_assignments.items():
        for a in assignments:
            pid = a["problem_id"]
            pv = problem_versions.get(pid, {})
            for field in ('problem_text', 'solution_text', 'hints'):
                text = pv.get(field, '')
                blocks = extract_blocks_with_context(text)
                for i, blk in enumerate(blocks):
                    rec_id = f"c{cid}_L{lesson}_p{pid}_{field}_{i}"
                    asy_rel = f"asy_corpus/{rec_id}.asy"
                    if not os.path.exists(os.path.join(REPO_ROOT, asy_rel)):
                        missing_asy += 1
                        continue
                    records.append({
                        "id": rec_id,
                        "collection_id": cid,
                        "collection_name": coll_names.get(
                            cid, f"Collection {cid}"),
                        "lesson": lesson,
                        "lesson_title": lesson_titles.get((cid, lesson)),
                        "source_kind": field,
                        "problem_id": pid,
                        "asy_path": asy_rel,
                        "context_before": blk["context_before"],
                        "context_after": blk["context_after"],
                    })

    records.sort(key=lambda r: (r["collection_id"], r["lesson"] or -1,
                                r["source_kind"], r["problem_id"] or 0,
                                r["id"]))

    out = {
        "version": 1,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "context_window": {"before": CONTEXT_BEFORE, "after": CONTEXT_AFTER},
        "collections": [
            {"collection_id": cid, "collection_name": coll_names.get(
                cid, f"Collection {cid}")}
            for cid in sorted(set(r["collection_id"] for r in records))
        ],
        "records": records,
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"\n=== Wrote {len(records)} records to {OUT_PATH} ===")
    print(f"    skipped {missing_asy} blocks with no .asy file in asy_corpus/")
    print(f"    skipped {empty_blocks} empty [asy] blocks")


if __name__ == '__main__':
    main()
