"""Trace the exact bytes in raw/cooked/fixed to figure out correct decoding."""
import sys, os, re
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.expanduser('~'), 'github', 'eigennode', 'scripts', '.env'))
import aops_db
import importlib.util

spec = importlib.util.spec_from_file_location(
    'fetchmod',
    os.path.join(os.path.dirname(__file__), '..', 'fetch-asy-diagrams.py'))
fm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fm)

cid, lesson, pid, field, idx = 289, 2, 38352, 'problem_text', 0
conn = aops_db.get_connection()
pv = aops_db.bulk_get_problem_versions(conn, [pid])[pid]
conn.close()
text = pv.get(field, '')
blocks = re.findall(r';?\[asy\](.*?)\[/asy\]', text, re.DOTALL)
raw = blocks[idx]

# Print hex of first 40 chars
print("RAW hex (first 40 chars):")
for i, ch in enumerate(raw[:40]):
    print(f"  [{i:2d}] 0x{ord(ch):02x} = {repr(ch)}")

# Try direct JSON-style double decode on the RAW block
# The raw appears to be JSON-string-encoded twice
# Step 1: first JSON decode (treating raw as a JSON string body)
import codecs

# Try: raw has `\\n` (backslash+backslash+n) → JSON decode → `\n` (backslash+n)
# Then: `\n` (backslash+n) → JSON decode → newline

# Manual double decode:
# 1. Replace \\\\n → \\n (reduce 4 chars to 2) -- NO, work on actual chars
# In actual string: raw has ['\', '\', 'n'] for each line break
# We want: ['newline']

# Two-pass approach on raw:
pass1 = raw.replace('\\\\', '\x00DBLBS\x00')  # protect \\
pass1 = pass1.replace('\\n', '\n')  # \n -> newline
pass1 = pass1.replace('\\r', '\r')
pass1 = pass1.replace('\\t', '\t')
pass1 = pass1.replace('\\"', '"')
pass1 = pass1.replace("\\'", "'")
pass1 = pass1.replace('\x00DBLBS\x00', '\\')  # restore \\

print("\n\nPASS1 (simple replace, first 500):")
print(pass1[:500])
print("\n...last 100:", repr(pass1[-100:]))
