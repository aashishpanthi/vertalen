/**
 * Language constants and helpers for the TMT API.
 *
 * The TMT API accepts case-insensitive codes in three forms:
 *   - Full name: English / Nepali / Tamang
 *   - 2-letter:  en / ne / (no ISO-639-1 for Tamang)
 *   - 3-letter:  eng / nep / tmg
 *
 * Internally we use the 3-letter codes as the canonical identifier
 * because they are stable and uniquely cover all three languages.
 */

export const LANGUAGES = Object.freeze({
  ENGLISH: {
    code: "eng",
    apiCode: "en",
    name: "English",
    nativeName: "English",
    script: "latin",
    direction: "ltr",
    flag: "🇬🇧",
  },
  NEPALI: {
    code: "nep",
    apiCode: "ne",
    name: "Nepali",
    nativeName: "नेपाली",
    script: "devanagari",
    direction: "ltr",
    flag: "🇳🇵",
  },
  TAMANG: {
    code: "tmg",
    apiCode: "tmg",
    name: "Tamang",
    nativeName: "तामाङ",
    script: "devanagari",
    direction: "ltr",
    flag: "🇳🇵",
  },
});

export const LANGUAGE_LIST = Object.values(LANGUAGES);

export const LANGUAGE_PAIRS = [
  ["eng", "nep"],
  ["nep", "eng"],
  ["eng", "tmg"],
  ["tmg", "eng"],
  ["nep", "tmg"],
  ["tmg", "nep"],
];

export function getLanguage(code) {
  if (!code) return null;
  const normalized = String(code).toLowerCase().trim();
  return (
    LANGUAGE_LIST.find(
      (lang) =>
        lang.code === normalized ||
        lang.apiCode === normalized ||
        lang.name.toLowerCase() === normalized ||
        lang.nativeName === code,
    ) || null
  );
}

export function isPairSupported(srcCode, tgtCode) {
  if (!srcCode || !tgtCode) return false;
  if (srcCode === tgtCode) return false;
  const src = getLanguage(srcCode);
  const tgt = getLanguage(tgtCode);
  if (!src || !tgt) return false;
  return LANGUAGE_PAIRS.some(([s, t]) => s === src.code && t === tgt.code);
}
