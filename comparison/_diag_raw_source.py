"""Diagnostic: pull the RAW DB text for one script/problem source and show the
[asy] block before and after unescape, so we can see exactly what the scraper
mangles. Usage: python comparison/_diag_raw_source.py c10_L9_script_0.asy
"""
import sys, os, re
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts', '.env'))
import aops_db

def parse_name(fname):
    b = fname.replace('.asy', '')
    m = re.match(r'c(\d+)_L(\d+)_p(\d+)_(.+)_(\d+)$', b)
    if m:
        return {'type': 'problem', 'cid': int(m.group(1)), 'lesson': int(m.group(2)),
                'pid': int(m.group(3)), 'field': m.group(4), 'idx': int(m.group(5))}
    m = re.match(r'c(\d+)_L(\d+)_script_(\d+)$', b)
    if m:
        return {'type': 'script', 'cid': int(m.group(1)), 'lesson': int(m.group(2)), 'idx': int(m.group(3))}
    return None

FIELD_MAP = {'solutiontext': 'solution_text', 'problemtext': 'problem_text'}

def get_raw_text(fname):
    p = parse_name(fname)
    conn = aops_db.get_connection()
    if p['type'] == 'script':
        docs = aops_db.bulk_get_script_documents(conn, [p['cid']])
        doc_id = docs.get((p['cid'], p['lesson']))
        dv = aops_db.bulk_get_document_versions(conn, [doc_id])[doc_id]
        lines = aops_db.bulk_get_document_lines(conn, dv['line_ids'])
        text = '\n'.join(str(lines.get(lid, '')) for lid in dv['line_ids'])
    else:
        pv = aops_db.bulk_get_problem_versions(conn, [p['pid']])[p['pid']]
        text = pv.get(FIELD_MAP.get(p['field'], p['field']), '')
    conn.close()
    return text, p

if __name__ == '__main__':
    fname = sys.argv[1]
    text, p = get_raw_text(fname)
    import importlib.util
    spec = importlib.util.spec_from_file_location('fetchmod', os.path.join(os.path.dirname(__file__), '..', 'fetch-asy-diagrams.py'))
    fm = importlib.util.module_from_spec(spec); spec.loader.exec_module(fm)
    blocks = re.findall(r';?\[asy\](.*?)\[/asy\]', text, re.DOTALL)
    raw = blocks[p['idx']] if p['idx'] < len(blocks) else ''
    cooked = fm.unescape_asy(raw)
    print("=== lines with a backslash: RAW -> CURRENT-UNESCAPE (repr) ===")
    rl = [l for l in raw.split('\n') if '\\' in l]
    cl = [l for l in cooked.split('\n') if '\\' in l]
    for r, c in zip(rl, cl):
        print("RAW :", repr(r))
        print("COOK:", repr(c))
        print()
