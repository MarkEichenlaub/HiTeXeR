"""
Fix 04296: double-escaped content in c289_L2_p38352_problem_text_0.asy
The raw DB block has content stored with double-JSON-encoding:
  original "  -> JSON level1: \" -> JSON level2: \\\" (3 backslashes + quote)
  original \n -> JSON level1: \n (backslash+n) -> JSON level2: \\n (2 backslashes+n)
  original \  -> JSON level1: \\ -> JSON level2: \\\\ (4 backslashes)
Fix: apply two rounds of JSON string decoding to the raw block.
Usage:
  python comparison/_fix04296.py          # dry run
  python comparison/_fix04296.py --apply  # write fixed files
"""
import sys, os, re, json
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts', '.env'))
import aops_db

cid, lesson, pid, field, idx = 289, 2, 38352, 'problem_text', 0
conn = aops_db.get_connection()
pv = aops_db.bulk_get_problem_versions(conn, [pid])[pid]
conn.close()
text = pv.get(field, '')
blocks = re.findall(r';?\[asy\](.*?)\[/asy\]', text, re.DOTALL)
raw = blocks[idx]
print(f"RAW repr (first 200): {repr(raw[:200])}")

def json_str_decode(s):
    """Decode s as a JSON string body (wraps in quotes then json.loads)."""
    return json.loads('"' + s + '"')

# First decode: undo outer JSON layer (\\n -> \n, \\\" -> \", \\\\ -> \\)
level1 = json_str_decode(raw)
print(f"\nLevel-1 repr (first 200): {repr(level1[:200])}")

# Second decode: undo inner JSON layer (\n -> newline, \" -> ", \\ -> \)
result = json_str_decode(level1)
print(f"\nLevel-2 (final) repr (first 200): {repr(result[:200])}")

result = result.strip()
if result and not result.rstrip().endswith(';'):
    result = result.rstrip() + ';'

print(f"\nFINAL CODE (first 600 chars):\n{result[:600]}")
print(f"\n...last 100 chars:\n{result[-100:]}")

if '--apply' in sys.argv:
    root = os.path.join(os.path.dirname(__file__), '..')
    asy_src = os.path.join(root, 'comparison', 'asy_src', '04296.asy')
    corpus = os.path.join(root, 'asy_corpus', 'c289_L2_p38352_problem_text_0.asy')
    with open(asy_src, 'w', newline='\n') as f:
        f.write(result + '\n')
    with open(corpus, 'w', newline='\n') as f:
        f.write(result + '\n')
    print(f"\nWrote: {asy_src}")
    print(f"Wrote: {corpus}")
else:
    print("\n(dry run — pass --apply to write files)")
