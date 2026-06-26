"""Re-scan AoPS Redshift into a STAGING dir (asy_corpus_rescan/) — never touches
asy_corpus/. A separate verified step (rescan-append.js) content-dedups the
staging output against the live corpus and APPENDS only genuinely-new diagrams
with stable new ids, so existing ids / texer_pngs are never disturbed.

Also emits asy_corpus_rescan/_scriptdocs.json: {"<cid>_<lesson>": script_doc_id}
for every (collection, lesson) — the source of truth for the "Open on AoPS"
document links (works for the whole corpus, not just new diagrams).

Run:  python rescan-staging.py
"""
import os, sys, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(HERE, '..', 'eigennode', 'scripts', '.env'))
import aops_db

# Reuse the battle-tested unescape/extract from fetch-asy-diagrams.py (hyphenated
# filename -> load via importlib).
spec = importlib.util.spec_from_file_location('fad', os.path.join(HERE, 'fetch-asy-diagrams.py'))
fad = importlib.util.module_from_spec(spec); spec.loader.exec_module(fad)
extract_asy_blocks = fad.extract_asy_blocks

OUT_DIR = os.path.join(HERE, 'asy_corpus_rescan')

# Existing corpus collections + the 2026-06 expansion (442 Physics 2, 441
# Relativity Camp, 540 MS Physics 2, 227 Accelerated Counting, 662 AMC 12 PS).
EXISTING = [4,10,36,51,53,57,71,95,134,175,186,190,191,268,282,289,321,398,
            400,401,402,405,462,463,510,539,582,583,647]
EXPANSION = [441,442,540,227,662]
TARGET = sorted(set(EXISTING + EXPANSION))
BATCH = 6  # collections per batch (bounds document-line memory)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = aops_db.get_connection()
    total = 0
    script_docs_all = {}  # "<cid>_<lesson>" -> doc_id (for the link table)

    for b in range(0, len(TARGET), BATCH):
        cids = TARGET[b:b + BATCH]
        print(f"\n=== Batch {b//BATCH+1}: collections {cids} ===", flush=True)

        script_docs = aops_db.bulk_get_script_documents(conn, cids)
        for (cid, lesson), doc_id in script_docs.items():
            script_docs_all[f"{cid}_{lesson}"] = doc_id
        doc_versions = aops_db.bulk_get_document_versions(conn, list(script_docs.values()))
        line_ids = [lid for dv in doc_versions.values() for lid in dv["line_ids"]]
        all_lines = aops_db.bulk_get_document_lines(conn, line_ids)

        # Scripts
        for (cid, lesson), doc_id in script_docs.items():
            dv = doc_versions.get(doc_id)
            if not dv:
                continue
            text = '\n'.join(all_lines.get(lid, '') for lid in dv["line_ids"])
            for i, block in enumerate(extract_asy_blocks(text)):
                fn = f"c{cid}_L{lesson}_script_{i}.asy"
                with open(os.path.join(OUT_DIR, fn), 'w', encoding='utf-8') as f:
                    f.write(block)
                total += 1

        # Homework problems
        hw = aops_db.bulk_get_homework_assignments(conn, cids)
        pids = list({a["problem_id"] for asg in hw.values() for a in asg})
        pvs = aops_db.bulk_get_problem_versions(conn, pids)
        for (cid, lesson), asg in hw.items():
            for a in asg:
                pv = pvs.get(a["problem_id"], {})
                for field in ('problem_text', 'solution_text', 'hints'):
                    for i, block in enumerate(extract_asy_blocks(pv.get(field, ''))):
                        fn = f"c{cid}_L{lesson}_p{a['problem_id']}_{field}_{i}.asy"
                        with open(os.path.join(OUT_DIR, fn), 'w', encoding='utf-8') as f:
                            f.write(block)
                        total += 1
        print(f"  running total staged: {total}", flush=True)

    conn.close()
    with open(os.path.join(OUT_DIR, '_scriptdocs.json'), 'w', encoding='utf-8') as f:
        json.dump(script_docs_all, f)
    print(f"\n=== Staged {total} asy blocks to {OUT_DIR} ===")
    print(f"=== {len(script_docs_all)} (collection,lesson) script doc ids -> _scriptdocs.json ===")


if __name__ == '__main__':
    main()
