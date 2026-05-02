/**
 * Lightweight language detection for the three TMT languages.
 *
 * Approach: Devanagari Unicode block (U+0900 – U+097F) covers both
 * Nepali and Tamang. Latin block covers English. We can't reliably
 * tell Nepali from Tamang by glyphs alone (both use Devanagari),
 * so we return "deva" when the dominant script is Devanagari and
 * the caller decides between Nepali and Tamang based on user
 * preference / target language.
 */

const RE_DEVANAGARI = /[\u0900-\u097F]/;
const RE_LATIN_LETTER = /[A-Za-z]/;

export function dominantScript(text) {
  if (!text) return "unknown";
  let deva = 0;
  let latin = 0;
  for (const ch of text) {
    if (RE_DEVANAGARI.test(ch)) deva++;
    else if (RE_LATIN_LETTER.test(ch)) latin++;
  }
  if (deva === 0 && latin === 0) return "unknown";
  return deva >= latin ? "deva" : "latin";
}

/**
 * Best-effort source language guess.
 *
 * @param {string} text The text to analyze
 * @param {string} hint Optional preferred Devanagari language: "nep" or "tmg"
 * @returns {"eng"|"nep"|"tmg"|null}
 */
export function detect(text, hint = "nep") {
  const script = dominantScript(text);
  if (script === "latin") return "eng";
  if (script === "deva") return hint === "tmg" ? "tmg" : "nep";
  return null;
}

export function pickTarget(srcCode, preferredTarget) {
  if (srcCode !== preferredTarget) return preferredTarget;
  if (srcCode === "eng") return "nep";
  if (srcCode === "nep") return "eng";
  if (srcCode === "tmg") return "eng";
  return "eng";
}
