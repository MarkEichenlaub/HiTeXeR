function stripLaTeX(text) {
  if (!text) return '';
  let s = text;
  // Remove $ delimiters
  s = s.replace(/\$/g, '');
  // Handle \frac{a}{b} → a/b (before removing braces)
  s = s.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '$1/$2');
  // Handle \underbrace{...} and \overbrace{...} → remove
  s = s.replace(/\\(?:underbrace|overbrace)\s*\{[^}]*\}/g, '');
  // Handle \hspace{...} → space
  s = s.replace(/\\hspace\s*\{[^}]*\}/g, ' ');
  // Handle \vspace{...} → remove entirely (vertical spacing)
  s = s.replace(/\\vspace\s*\{[^}]*\}/g, '');
  // Handle \sqrt{a} → √a
  s = s.replace(/\\sqrt\s*\{([^}]*)\}/g, '√$1');
  // Common LaTeX commands → Unicode
  const texMap = {
    '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\epsilon':'ε',
    '\\zeta':'ζ','\\eta':'η','\\theta':'θ','\\iota':'ι','\\kappa':'κ',
    '\\lambda':'λ','\\mu':'μ','\\nu':'ν','\\xi':'ξ','\\pi':'π',
    '\\rho':'ρ','\\sigma':'σ','\\tau':'τ','\\upsilon':'υ','\\phi':'φ',
    '\\chi':'χ','\\psi':'ψ','\\omega':'ω',
    '\\Gamma':'Γ','\\Delta':'Δ','\\Theta':'Θ','\\Lambda':'Λ','\\Xi':'Ξ',
    '\\Pi':'Π','\\Sigma':'Σ','\\Phi':'Φ','\\Psi':'Ψ','\\Omega':'Ω',
    '\\infty':'∞','\\pm':'±','\\mp':'∓','\\times':'×','\\div':'÷',
    '\\cdot':'·','\\cdots':'⋯','\\ldots':'…','\\vdots':'⋮','\\ddots':'⋱','\\dots':'⋯',
    '\\le':'≤','\\leq':'≤','\\ge':'≥','\\geq':'≥',
    '\\neq':'≠','\\approx':'≈','\\equiv':'≡',
    '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'\u2192','\\leftarrow':'\u2190','\\Rightarrow':'\u21D2','\\Leftarrow':'\u21D0',
    '\\longrightarrow':'\u2192','\\longleftarrow':'\u2190','\\Longrightarrow':'\u21D2','\\Longleftarrow':'\u21D0',
    '\\leftrightarrow':'\u2194','\\triangle':'\u25B3','\\angle':'\u2220','\\perp':'\u22A5',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ', '\\prime':'′',
    '\\cos':'cos','\\sin':'sin','\\tan':'tan','\\log':'log','\\ln':'ln',
    '\\left':'','\\right':'',
    '\\%':'%','\\#':'#','\\&':'&','\\$':'$',
  };
  // Sort by key length descending so longer commands match first (e.g. \left before \le)
  const sortedEntries = Object.entries(texMap).sort((a,b) => b[0].length - a[0].length);
  for (const [cmd, uni] of sortedEntries) {
    s = s.split(cmd).join(uni);
  }
  // Handle \<space> (TeX inter-word space), \~ (non-breaking space), \; \, \: (thin/medium space), \! (negative thin space) → space
  s = s.replace(/\\[ ~;,:!]/g, ' ');
  // Strip \definecolor{name}{model}{values} declarations (no visible output)
  s = s.replace(/\\definecolor\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}/g, '');
  // Strip \color{name} commands, keeping surrounding text
  s = s.replace(/\\color\s*\{[^}]*\}/g, '');
  // Strip \rm (font switch, not braced form)
  s = s.replace(/\\rm\b/g, '');
  // Handle font-wrapper commands (\mathbf, \mathrm, etc.) — remove command, keep content.
  // In math mode, spaces between these commands are ignored (e.g. \mathbf{C} \mathbf{i} → Ci).
  s = s.replace(/\\(?:mathbf|mathrm|mathit|mathsf|mathtt|textbf|textit|textrm|text|operatorname)\s*\{([^}]*)\}/g, '$1');
  // Handle accent commands: \vec{X} → X⃗, \hat{X} → X̂, \bar{X} → X̄, etc.
  s = s.replace(/\\vec\s*\{([^}]*)\}/g, '$1\u20D7');
  s = s.replace(/\\hat\s*\{([^}]*)\}/g, '$1\u0302');
  s = s.replace(/\\bar\s*\{([^}]*)\}/g, '$1\u0304');
  s = s.replace(/\\tilde\s*\{([^}]*)\}/g, '$1\u0303');
  s = s.replace(/\\dot\s*\{([^}]*)\}/g, '$1\u0307');
  s = s.replace(/\\ddot\s*\{([^}]*)\}/g, '$1\u0308');
  s = s.replace(/\\overline\s*\{([^}]*)\}/g, '$1\u0305');
  s = s.replace(/\\underline\s*\{([^}]*)\}/g, '$1\u0332');
  s = s.replace(/\\overrightarrow\s*\{([^}]*)\}/g, '$1\u20D7');
  // Remove remaining \command sequences
  s = s.replace(/\\[a-zA-Z]+/g, '');
  // Remove braces
  s = s.replace(/[{}]/g, '');
  // Convert ^{...} and _{...} to Unicode superscripts/subscripts
  const superMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ',
    'e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ',
    'r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ'};
  const subMap = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ',
    'k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ',
    'v':'ᵥ','x':'ₓ'};
  function toSuper(ch) { return superMap[ch] || ch; }
  function toSub(ch) { return subMap[ch] || ch; }
  // ^{multi} and _{multi}
  s = s.replace(/\^{([^}]*)}/g, (_, g) => [...g].map(toSuper).join(''));
  s = s.replace(/_{([^}]*)}/g, (_, g) => [...g].map(toSub).join(''));
  // ^single and _single character
  s = s.replace(/\^(.)/g, (_, ch) => toSuper(ch));
  s = s.replace(/_(.)/g, (_, ch) => toSub(ch));
  // Collapse multiple spaces and remove spaces adjacent to parentheses/brackets
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+\(/g, '(');
  s = s.replace(/\(\s+/g, '(');
  s = s.replace(/\s+\)/g, ')');
  s = s.replace(/\[\s+/g, '[');
  s = s.replace(/\s+\]/g, ']');
  return s.trim();
}
module.exports = stripLaTeX;
