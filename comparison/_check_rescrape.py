"""For given numeric IDs, fetch raw DB text via current scraper, re-extract the
mapped [asy] block, and report: does the re-scraped block still match the
corpus? does it still contain code-level literal backslash-t? is the block the
SAME diagram (content sanity) or has the live doc been edited (stale)?

Usage: python comparison/_check_rescrape.py 00926,03303,09105
"""
import sys, os, re, json, importlib.util
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts', '.env'))
import aops_db

ASY_SRC = os.path.join(ROOT, 'comparison', 'asy_src')
MANIFEST = os.path.join(ROOT, 'comparison', 'blink-manifest.json')
spec = importlib.util.spec_from_file_location('fm', os.path.join(ROOT, 'fetch-asy-diagrams.py'))
fm = importlib.util.module_from_spec(spec); spec.loader.exec_module(fm)

sys.path.insert(0, os.path.join(ROOT, 'comparison'))
import _scan_codetab as sc

FIELD_MAP = {'solutiontext': 'solution_text', 'problemtext': 'problem_text', 'hints': 'hints'}

def parse_name(fname):
    b = fname.replace('.asy', '')
    m = re.match(r'c(\d+)_L(\d+)_p(\d+)_(.+)_(\d+)$', b)
    if m:
        return {'type':'problem','cid':int(m.group(1)),'lesson':int(m.group(2)),'pid':int(m.group(3)),'field':m.group(4),'idx':int(m.group(5))}
    m = re.match(r'c(\d+)_L(None|\d+)_script_(\d+)$', b)
    if m:
        lesson = None if m.group(2)=='None' else int(m.group(2))
        return {'type':'script','cid':int(m.group(1)),'lesson':lesson,'idx':int(m.group(3))}
    return None

def main():
    ids = [x.strip() for x in sys.argv[1].split(',') if x.strip()]
    man = json.load(open(MANIFEST, encoding='utf-8'))
    src_map = {d['id']: d['source'] for d in man['diagrams'] if d.get('source')}
    conn = aops_db.get_connection()
    for did in ids:
        fname = src_map.get(did)
        p = parse_name(fname) if fname else None
        corpus_path = os.path.join(ASY_SRC, did + '.asy')
        corpus = open(corpus_path, encoding='utf-8').read() if os.path.exists(corpus_path) else ''
        c_nt, c_nn = sc.code_hits(corpus)
        if not p:
            print(f'{did}: UNMAPPED ({fname})'); continue
        try:
            if p['type'] == 'script':
                docs = aops_db.bulk_get_script_documents(conn, [p['cid']])
                doc_id = docs.get((p['cid'], p['lesson']))
                if not doc_id:
                    print(f'{did}: NO-DOC ({fname})'); continue
                dv = aops_db.bulk_get_document_versions(conn, [doc_id])[doc_id]
                lines = aops_db.bulk_get_document_lines(conn, dv['line_ids'])
                text = '\n'.join(str(lines.get(lid, '')) for lid in dv['line_ids'])
            else:
                pv = aops_db.bulk_get_problem_versions(conn, [p['pid']]).get(p['pid'])
                if not pv:
                    print(f'{did}: NO-PV ({fname})'); continue
                text = pv.get(FIELD_MAP.get(p['field'], p['field']), '')
            blocks = fm.extract_asy_blocks(text)
            if p['idx'] >= len(blocks):
                print(f'{did}: IDX-OOR idx={p["idx"]} nblocks={len(blocks)} ({fname})'); continue
            new = blocks[p['idx']]
            n_nt, n_nn = sc.code_hits(new)
            # crude content-identity check: compare set of identifier-ish tokens
            def sig(s):
                return set(re.findall(r'[A-Za-z_]{4,}', s))
            cs, ns = sig(corpus), sig(new)
            jac = len(cs & ns) / max(1, len(cs | ns))
            stale = 'STALE' if jac < 0.5 else 'ok'
            same = 'IDENTICAL' if new.strip() == corpus.strip() else 'diff'
            print(f'{did}: {p["type"]:7s} corpusTab={c_nt} newTab={n_nt} jaccard={jac:.2f} {stale} {same}')
        except Exception as e:
            print(f'{did}: ERR {e}')
    conn.close()

if __name__ == '__main__':
    main()
