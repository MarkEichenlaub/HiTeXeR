"""Re-scrape selected numeric-ID diagrams from Redshift using the FIXED scraper.

Maps numeric IDs (comparison/asy_src/NNNNN.asy) back to their original source
filename via comparison/blink-manifest.json (diagrams[].source), re-fetches the
raw DB text, re-extracts the [asy] block with fetch-asy-diagrams.py's current
(fixed) extract_asy_blocks/unescape_asy, and overwrites asy_src/NNNNN.asy.

The two fixes this re-scrape applies vs. the old corpus:
  1. trailing-semicolon truncation (regex `;?[/asy]` -> `[/asy]`)
  2. `\\` collapse inside string literals (string-aware unescape)

Usage:
  python comparison/rescrape-failures.py --ids 00035,00467 --dry-run
  python comparison/rescrape-failures.py --missing-png            # all failing
  python comparison/rescrape-failures.py --ids-file failing.txt --apply
"""
import sys, os, re, json, argparse, importlib.util, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts', '.env'))
import aops_db

ASY_SRC = os.path.join(ROOT, 'comparison', 'asy_src')
TEXER = os.path.join(ROOT, 'comparison', 'texer_pngs')
MANIFEST = os.path.join(ROOT, 'comparison', 'blink-manifest.json')

# Reuse the FIXED extractor so re-scrape == future scrape, exactly.
_spec = importlib.util.spec_from_file_location('fetchmod', os.path.join(ROOT, 'fetch-asy-diagrams.py'))
_fm = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_fm)
extract_asy_blocks = _fm.extract_asy_blocks

FIELD_MAP = {'solutiontext': 'solution_text', 'problemtext': 'problem_text', 'hints': 'hints'}

def parse_name(fname):
    b = fname.replace('.asy', '')
    m = re.match(r'c(\d+)_L(\d+)_p(\d+)_(.+)_(\d+)$', b)
    if m:
        return {'type': 'problem', 'cid': int(m.group(1)), 'lesson': int(m.group(2)),
                'pid': int(m.group(3)), 'field': m.group(4), 'idx': int(m.group(5))}
    # Lesson may be a real number OR the literal "None" (null-lesson script docs,
    # whose DB key is (cid, None)); keep that mapping so these are re-scrapeable.
    m = re.match(r'c(\d+)_L(None|\d+)_script_(\d+)$', b)
    if m:
        lesson = None if m.group(2) == 'None' else int(m.group(2))
        return {'type': 'script', 'cid': int(m.group(1)), 'lesson': lesson, 'idx': int(m.group(3))}
    return None

def load_manifest_map():
    m = json.load(open(MANIFEST, encoding='utf-8'))
    return {d['id']: d['source'] for d in m['diagrams'] if d.get('source')}

def missing_png_ids():
    have = {f[:-4] for f in os.listdir(TEXER) if f.endswith('.png')}
    allids = {f[:-4] for f in os.listdir(ASY_SRC) if f.endswith('.asy')}
    return sorted(allids - have)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids')
    ap.add_argument('--ids-file')
    ap.add_argument('--missing-png', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    opt = ap.parse_args()

    if opt.ids:
        targets = [x.strip() for x in opt.ids.split(',') if x.strip()]
    elif opt.ids_file:
        targets = [l.strip() for l in open(opt.ids_file) if l.strip()]
    elif opt.missing_png:
        targets = missing_png_ids()
    else:
        ap.error('need --ids, --ids-file, or --missing-png')

    apply = opt.apply and not opt.dry_run
    src_map = load_manifest_map()

    # Resolve each target to its parsed source; group for bulk DB fetch.
    parsed = {}
    unmapped = []
    for did in targets:
        fname = src_map.get(did)
        p = parse_name(fname) if fname else None
        if not p:
            unmapped.append(did); continue
        parsed[did] = (fname, p)

    print(f"targets={len(targets)} mapped={len(parsed)} unmapped={len(unmapped)}")
    if unmapped:
        print(f"  unmapped (no manifest source / unparseable): {unmapped[:20]}")

    collection_ids = sorted({p['cid'] for _, (f, p) in parsed.items()})
    script_keys = {(p['cid'], p['lesson']) for _, (f, p) in parsed.items() if p['type'] == 'script'}
    problem_ids = sorted({p['pid'] for _, (f, p) in parsed.items() if p['type'] == 'problem'})

    conn = aops_db.get_connection()
    print(f"fetching scripts for {len(collection_ids)} collections...")
    script_docs = aops_db.bulk_get_script_documents(conn, collection_ids)
    needed_docs = {k: v for k, v in script_docs.items() if k in script_keys}
    doc_versions = aops_db.bulk_get_document_versions(conn, list(needed_docs.values()))
    all_line_ids = [lid for dv in doc_versions.values() for lid in dv['line_ids']]
    print(f"fetching {len(all_line_ids)} script lines...")
    all_lines = aops_db.bulk_get_document_lines(conn, all_line_ids)
    print(f"fetching {len(problem_ids)} problem versions...")
    problem_versions = aops_db.bulk_get_problem_versions(conn, problem_ids)
    conn.close()

    rescraped = changed = failed = 0
    for did, (fname, p) in sorted(parsed.items()):
        code = None
        if p['type'] == 'script':
            doc_id = needed_docs.get((p['cid'], p['lesson']))
            dv = doc_versions.get(doc_id) if doc_id else None
            if not dv:
                print(f"  FAIL {did} ({fname}): no script doc/version"); failed += 1; continue
            text = '\n'.join(str(all_lines.get(lid, '')) for lid in dv['line_ids'])
        else:
            pv = problem_versions.get(p['pid'])
            if not pv:
                print(f"  FAIL {did} ({fname}): no problem version"); failed += 1; continue
            text = pv.get(FIELD_MAP.get(p['field'], p['field']), '')
        blocks = extract_asy_blocks(text)
        if p['idx'] >= len(blocks):
            print(f"  FAIL {did} ({fname}): idx {p['idx']} >= {len(blocks)} blocks"); failed += 1; continue
        code = blocks[p['idx']]
        rescraped += 1

        out_path = os.path.join(ASY_SRC, f"{did}.asy")
        old = open(out_path, encoding='utf-8').read() if os.path.exists(out_path) else None
        if old == code:
            continue
        changed += 1
        if opt.dry_run:
            print(f"\n=== {did} ({fname}) WOULD CHANGE ===")
            ol = (old or '').rstrip().split('\n')[-1] if old else '(none)'
            nl = code.rstrip().split('\n')[-1]
            print(f"  old last line: {ol!r}")
            print(f"  new last line: {nl!r}")
            print(f"  old endswith ';': {(old or '').rstrip().endswith(';')}  new: {code.rstrip().endswith(';')}")
        elif apply:
            if old is not None and not os.path.exists(out_path + '.prebak'):
                shutil.copy2(out_path, out_path + '.prebak')
            with open(out_path, 'w', encoding='utf-8', newline='') as f:
                f.write(code)

    print(f"\n{'DRY-RUN' if opt.dry_run else ('APPLIED' if apply else 'NO-OP')}: "
          f"rescraped={rescraped} changed={changed} failed={failed}")

if __name__ == '__main__':
    main()
