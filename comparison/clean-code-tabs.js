'use strict';
/**
 * clean-code-tabs.js — undo the historical "\t-corruption" from the redshift
 * import at the moment asy_corpus source is copied into the render tree.
 *
 * The buggy import blanket-replaced escape sequences; a later over-correction
 * stopped expanding \t entirely, leaving code-level indentation as the literal
 * two chars backslash-t (e.g. 03283 line 13 `\treturn ...`). That is invalid
 * Asymptote and shifts/breaks rendering. This converts code-level (i.e. OUTSIDE
 * string literals and comments) backslash-t -> TAB and backslash-n -> newline,
 * while preserving in-string LaTeX such as "$\theta$".
 *
 * It is the JS twin of comparison/_fix_codetab_src.py fix_code(). It is applied
 * by every asy_corpus -> comparison/asy_src copy step (repopulate-asy-src.js and
 * ssim-pipeline.js) so that even if a corpus file still carries the corruption,
 * the render source can never be re-corrupted. Idempotent: clean input passes
 * through unchanged.
 */
function cleanCodeTabs(s) {
  const BS = '\\';
  let out = '';
  let i = 0;
  const n = s.length;
  let sd = null;   // active string delimiter (" or '), else null
  let il = false;  // inside // line comment
  let ib = false;  // inside /* block comment */
  while (i < n) {
    const c = s[i];
    const c2 = i + 1 < n ? s[i + 1] : '';
    if (sd !== null) {                 // inside a string literal
      if (c === BS) { out += c; if (i + 1 < n) out += s[i + 1]; i += 2; continue; }
      if (c === sd) sd = null;
      out += c; i++; continue;
    }
    if (il) { if (c === '\n') il = false; out += c; i++; continue; }
    if (ib) { if (c === '*' && c2 === '/') { ib = false; out += c + c2; i += 2; continue; } out += c; i++; continue; }
    if (c === '/' && c2 === '/') { il = true; out += c; i++; continue; }
    if (c === '/' && c2 === '*') { ib = true; out += c + c2; i += 2; continue; }
    if (c === '"' || c === "'") { sd = c; out += c; i++; continue; }
    if (c === BS && c2 === 't') { out += '\t'; i += 2; continue; }
    if (c === BS && c2 === 'n') { out += '\n'; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

module.exports = { cleanCodeTabs };
