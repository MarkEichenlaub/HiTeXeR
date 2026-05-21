"""Static feature extraction for the diagram library.

Reads library/manifest.json (built by build-manifest.py), parses each
.asy file referenced by `asy_path`, and merges a `features` block
into every record. Then writes manifest.json back.

Features are all derivable from the raw source — no LLM, no rendering.
They power the cheap filters in the library UI: "show all 3D diagrams",
"only diagrams using import graph", "tiny examples under 20 LOC", etc.

Per-record `features` shape:
  {
    "imports":          ["graph", "three", ...],   # all `import X;` modules
    "primitive_counts": {"draw": 5, "label": 3, ...},
    "loc":              23,                        # non-blank, non-comment lines
    "total_lines":      31,                        # raw line count
    "has_3d":           false,
    "has_animation":    false,
    "has_palette":      false,
    "has_axes":         false,
    "has_arrows":       false,
    "pen_colors":       ["red", "blue"],
    "uses_size":        true,
    "uses_unitsize":    false,
    "uses_defaultpen":  false
  }

Idempotent: running it again recomputes and overwrites `features`.
"""

import os
import sys
import re
import json


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json')


# Asymptote primitives we count by name. Curated for high filtering signal;
# extend as needed. Order doesn't matter; dict keys carry the count.
PRIMITIVES = [
    # drawing
    'draw', 'fill', 'filldraw', 'label', 'dot', 'drawline',
    # geometric constructions
    'circle', 'arc', 'circumcircle', 'incircle', 'perpendicular',
    'markangle', 'rightanglemark',
    # axes / plots
    'xaxis', 'yaxis', 'axes', 'graph', 'plot',
    # 3D
    'surface', 'tube', 'draw3', 'revolution',
    # paths / transforms
    'path', 'transform', 'rotate', 'shift', 'scale',
    # sizing
    'size', 'unitsize', 'defaultpen',
    # pictures / containers
    'picture', 'add', 'shipout', 'clip',
]


# Asymptote named pens (subset). If a token sits as a standalone word in
# the source, count it as a used color. We catch the long-form names —
# users' custom RGB pens won't be tagged.
NAMED_PENS = [
    'black', 'white', 'gray', 'grey', 'lightgray', 'darkgray',
    'red', 'blue', 'green', 'cyan', 'magenta', 'yellow', 'orange',
    'pink', 'purple', 'brown',
    'palegreen', 'palered', 'paleblue', 'paleyellow', 'palemagenta',
    'palecyan',
    'lightblue', 'lightgreen', 'lightred', 'lightyellow', 'lightcyan',
    'lightmagenta',
    'heavyblue', 'heavygreen', 'heavyred', 'heavycyan', 'heavymagenta',
    'darkblue', 'darkgreen', 'darkred', 'darkcyan', 'darkmagenta',
    'olive', 'mediumblue', 'springgreen', 'royalblue',
]

# Imports that imply 3D content
THREE_D_IMPORTS = {'three', 'graph3', 'tube', 'solids', 'revolution'}

# Imports that imply animation
ANIMATION_IMPORTS = {'animation', 'animate'}

# Imports for the colorbar/contour stack
PALETTE_IMPORTS = {'palette', 'contour'}


# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------

# Strip line comments (// ...) and block comments (/* ... */).
LINE_COMMENT_RE = re.compile(r'//[^\n]*')
BLOCK_COMMENT_RE = re.compile(r'/\*.*?\*/', re.DOTALL)

# Asymptote imports: `import X;` or `import X as Y;`. Also handle
# the (less common) `access X;`.
IMPORT_RE = re.compile(
    r'^\s*(?:import|access)\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    re.MULTILINE,
)


def _call_re(name):
    """Word-boundary regex for `name(` (a call site)."""
    return re.compile(r'\b' + re.escape(name) + r'\s*\(')


def _word_re(name):
    """Word-boundary regex for `name` as a standalone token."""
    return re.compile(r'\b' + re.escape(name) + r'\b')


# Pre-compile call-site regexes once
_PRIMITIVE_REGEXES = {p: _call_re(p) for p in PRIMITIVES}
_PEN_REGEXES = {c: _word_re(c) for c in NAMED_PENS}
_ARROW_RE = re.compile(r'\bArrow\b|\bEndArrow\b|\bMidArrow\b')


# ---------------------------------------------------------------------------
# Per-file extraction
# ---------------------------------------------------------------------------

def strip_comments(text):
    """Remove // line comments and /* */ block comments."""
    text = BLOCK_COMMENT_RE.sub('', text)
    text = LINE_COMMENT_RE.sub('', text)
    return text


def extract_features(source):
    """Compute the features dict for one .asy source string."""
    raw_lines = source.splitlines()
    total_lines = len(raw_lines)

    code = strip_comments(source)
    code_lines = [ln for ln in code.splitlines() if ln.strip()]
    loc = len(code_lines)

    imports = sorted(set(IMPORT_RE.findall(code)))

    primitive_counts = {}
    for name, rx in _PRIMITIVE_REGEXES.items():
        n = len(rx.findall(code))
        if n:
            primitive_counts[name] = n

    pen_colors = sorted(c for c, rx in _PEN_REGEXES.items() if rx.search(code))

    imports_set = set(imports)
    return {
        "imports": imports,
        "primitive_counts": primitive_counts,
        "loc": loc,
        "total_lines": total_lines,
        "has_3d": bool(imports_set & THREE_D_IMPORTS),
        "has_animation": bool(imports_set & ANIMATION_IMPORTS),
        "has_palette": bool(imports_set & PALETTE_IMPORTS),
        "has_axes": any(p in primitive_counts
                        for p in ('xaxis', 'yaxis', 'axes')),
        "has_arrows": bool(_ARROW_RE.search(code)),
        "pen_colors": pen_colors,
        "uses_size": 'size' in primitive_counts,
        "uses_unitsize": 'unitsize' in primitive_counts,
        "uses_defaultpen": 'defaultpen' in primitive_counts,
    }


# ---------------------------------------------------------------------------
# Manifest driver
# ---------------------------------------------------------------------------

def main():
    if not os.path.exists(MANIFEST_PATH):
        print(f"ERROR: {MANIFEST_PATH} not found. Run build-manifest.py first.",
              file=sys.stderr)
        sys.exit(1)

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    records = manifest.get('records', [])
    print(f"Scanning features for {len(records)} records...")

    updated = 0
    missing = 0
    errors = 0

    for rec in records:
        asy_path = os.path.join(REPO_ROOT, rec['asy_path'])
        if not os.path.exists(asy_path):
            missing += 1
            rec['features'] = None
            continue
        try:
            with open(asy_path, 'r', encoding='utf-8', errors='replace') as f:
                source = f.read()
        except OSError as e:
            print(f"  read error on {asy_path}: {e}", file=sys.stderr)
            errors += 1
            rec['features'] = None
            continue
        rec['features'] = extract_features(source)
        updated += 1

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n=== Updated {updated} records ===")
    if missing:
        print(f"    {missing} records had no .asy file on disk")
    if errors:
        print(f"    {errors} read errors")

    # Summary stats so the user can sanity-check the result
    if updated:
        all_imports = {}
        n_3d = n_anim = n_palette = n_axes = n_arrows = 0
        loc_total = 0
        for rec in records:
            f_ = rec.get('features')
            if not f_:
                continue
            for imp in f_['imports']:
                all_imports[imp] = all_imports.get(imp, 0) + 1
            n_3d += f_['has_3d']
            n_anim += f_['has_animation']
            n_palette += f_['has_palette']
            n_axes += f_['has_axes']
            n_arrows += f_['has_arrows']
            loc_total += f_['loc']
        print("\nTop 15 imports:")
        for name, count in sorted(all_imports.items(),
                                  key=lambda x: -x[1])[:15]:
            print(f"    {count:5d}  {name}")
        print(f"\n  has_3d:        {n_3d}")
        print(f"  has_animation: {n_anim}")
        print(f"  has_palette:   {n_palette}")
        print(f"  has_axes:      {n_axes}")
        print(f"  has_arrows:    {n_arrows}")
        print(f"  mean LOC:      {loc_total / updated:.1f}")


if __name__ == '__main__':
    main()
