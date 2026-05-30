"""Test unescape_asy across all scraper copies: single + double quoted LaTeX,
escaped delimiters, comments, structural whitespace. No DB import needed --
the function is sliced out of each source file and exec'd in isolation."""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {
    'fetch-asy-diagrams.py': os.path.join(ROOT, 'fetch-asy-diagrams.py'),
    'fetch_needed_asy.py': os.path.join(ROOT, 'fetch_needed_asy.py'),
    'fetch-physics-asy.py': os.path.join(ROOT, 'comparison', 'fetch-physics-asy.py'),
    'build-manifest.py': os.path.join(ROOT, 'library', 'build-manifest.py'),
}

def load_fn(path):
    src = open(path, encoding='utf-8').read()
    lines = src.splitlines(keepends=True)
    # find the `def unescape_asy` line, then take until the next line that
    # starts a new top-level statement (non-indented, non-blank).
    start = next(k for k, l in enumerate(lines) if l.startswith('def unescape_asy'))
    end = start + 1
    while end < len(lines) and (lines[end].strip() == '' or lines[end][:1] in (' ', '\t')):
        end += 1
    ns = {}
    exec(compile(''.join(lines[start:end]), path, 'exec'), ns)
    return ns['unescape_asy']

BS = chr(92)   # backslash
TAB = chr(9)
NL = chr(10)
CR = chr(13)

# (name, input, expected_output)
CASES = [
    # double-quoted LaTeX with \t/\n/\r commands -> preserved (single backslash)
    ('dq_theta',  'label("$' + BS + 'theta$", X);', 'label("$' + BS + 'theta$", X);'),
    ('dq_nu',     'label("$' + BS + 'nu$", X);',     'label("$' + BS + 'nu$", X);'),
    # single-quoted LaTeX with \t/\n/\r commands -> MUST be preserved (the new fix)
    ('sq_theta',  "label('$" + BS + "theta$', X);",  "label('$" + BS + "theta$', X);"),
    ('sq_tan',    "label('$" + BS + "tan x$', X);",  "label('$" + BS + "tan x$', X);"),
    ('sq_nu',     "label('$" + BS + "nu$', X);",      "label('$" + BS + "nu$', X);"),
    ('sq_rho',    "label('$" + BS + "rho$', X);",      "label('$" + BS + "rho$', X);"),
    # single-quoted with escaped delimiter (\' prime) -> preserved verbatim
    ('sq_escq',   "label('$F" + BS + "'$');",         "label('$F" + BS + "'$');"),
    # double-quoted with escaped delimiter
    ('dq_escq',   'label("a' + BS + '"b");',           'label("a' + BS + '"b");'),
    # LaTeX line break \\ inside a single-quoted string -> preserved as \\
    ('sq_dblbs',  "label('a" + BS + BS + "b');",        "label('a" + BS + BS + "b');"),
    # structural escapes OUTSIDE strings DO expand
    ('struct_nl', 'draw(A--B);' + BS + 'nlabel("x");',  'draw(A--B);' + NL + 'label("x");'),
    ('struct_tab','if(x)' + BS + 't' + 'y;',             'if(x)' + TAB + 'y;'),
    # an apostrophe inside a double-quoted string is NOT a delimiter
    ('apos_in_dq','label("Euler' + "'" + 's line"); x=' + BS + 'tdone;',
                  'label("Euler' + "'" + 's line"); x=' + TAB + 'done;'),
    # a quote inside a // comment must NOT toggle string state;
    # the \theta after the comment's newline IS code-level... but here keep it simple:
    ('comment_q', '// it' + "'" + 's fine' + BS + 'nreal x;',
                  '// it' + "'" + 's fine' + NL + 'real x;'),
    # \theta inside a // comment stays literal backslash (not TAB)
    ('comment_theta', '//label("$' + BS + 'theta$")' + BS + 'nreal x;',
                      '//label("$' + BS + 'theta$")' + NL + 'real x;'),
]

def show(s):
    return s.replace(BS, '\\').replace(TAB, '<TAB>').replace(NL, '<NL>').replace(CR, '<CR>')

all_ok = True
for fname, path in FILES.items():
    fn = load_fn(path)
    fails = 0
    for name, inp, exp in CASES:
        got = fn(inp)
        if got != exp:
            fails += 1
            print(f'  [{fname}] FAIL {name}')
            print(f'      in : {show(inp)}')
            print(f'      exp: {show(exp)}')
            print(f'      got: {show(got)}')
    status = 'OK' if fails == 0 else f'{fails} FAIL'
    print(f'{fname}: {len(CASES)-fails}/{len(CASES)} {status}')
    all_ok = all_ok and fails == 0

print()
print('ALL PASS' if all_ok else 'SOME FAILED')
