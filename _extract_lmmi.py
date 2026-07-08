"""
Extract glyph outlines from the Type1 lmmi12 font (Latin Modern Math Italic,
12pt optical design — the metric twin of cmmi12) into a JSON consumable by
build-katex-glyphs.js as an outline-override source for KaTeX_Math-Italic.

Output: lmmi12-outlines.json  { "<char>": { "p": "<svg path, y-UP, 1000upem>",
                                            "a": <advance in 1000upem units> } }
"""
import json
import io
from fontTools import t1Lib
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

PFB = r"C:\Users\Mark Eichenlaub\AppData\Local\Programs\MiKTeX\fonts\type1\public\lm\lmmi12.pfb"
OUT = "lmmi12-outlines.json"

# glyph-name -> character map for the KaTeX_Math-Italic coverage we need:
# Latin letters map by name; Greek by TeX names.
NAME_TO_CHAR = {}
for c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ":
    NAME_TO_CHAR[c] = c
GREEK = {
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon1': 'ε',
    'epsilon': 'ϵ', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι',
    'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ',
    'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
    'phi': 'ϕ', 'phi1': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
    'theta1': 'ϑ', 'rho1': 'ϱ', 'sigma1': 'ς', 'omega1': 'ϖ',
    'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ', 'Xi': 'Ξ',
    'Pi': 'Π', 'Sigma': 'Σ', 'Upsilon': 'Υ', 'Phi': 'Φ', 'Psi': 'Ψ',
    'Omega': 'Ω',
    'partialdiff': '∂', 'ell': 'ℓ', 'weierstrass': '℘', 'imath': 'ı',
    'jmath': 'ȷ', 'period': '.', 'comma': ',', 'slash': '/',
    'less': '<', 'greater': '>',
}
NAME_TO_CHAR.update(GREEK)

font = t1Lib.T1Font(PFB)
font.parse()
gs = font.getGlyphSet()
upm = 1000  # Type1 fonts are 1000/em by convention

out = {}
for name, ch in NAME_TO_CHAR.items():
    if name not in gs:
        continue
    g = gs[name]
    pen = SVGPathPen(gs)
    try:
        g.draw(pen)
    except Exception:
        continue
    d = pen.getCommands()
    if not d:
        continue
    # SVGPathPen emits y-UP font coordinates already (fontTools convention);
    # build-katex-glyphs stores y-UP too, so keep as-is. Advance:
    adv = getattr(g, 'width', None)
    out[ch] = {"p": d, "a": round(adv if adv is not None else 0, 1)}

with io.open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print("wrote", OUT, len(out), "glyphs")
