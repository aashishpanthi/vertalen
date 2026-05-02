/**
 * Multi-script sentence splitter optimized for English, Nepali, and Tamang.
 *
 * Why a custom splitter:
 *   - The TMT API is sentence-level only; paragraphs must be split first.
 *   - Off-the-shelf splitters miss the Devanagari danda (।) and double danda (॥).
 *   - We must keep punctuation attached so reassembly preserves spacing.
 *
 * Strategy:
 *   1. Normalize whitespace.
 *   2. Walk the string and emit a sentence whenever we encounter
 *      a sentence-terminating punctuation followed by whitespace
 *      or end-of-string.
 *   3. Handle common abbreviations (Mr., Dr., U.S., e.g.) so we
 *      don't over-split on periods.
 *   4. Keep the original whitespace between sentences as a separate
 *      "glue" entry so the reassembler can perfectly reconstruct
 *      the input.
 */

const SENTENCE_TERMINATORS = new Set([
  ".",
  "!",
  "?",
  "।", // Devanagari danda U+0964
  "॥", // Devanagari double danda U+0965
  "…",
]);

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "u.s",
  "u.k",
  "ph.d",
  "no",
  "fig",
  "vol",
  "pp",
  "ed",
]);

function isWordChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 97 && code <= 122) return true; // a-z
  if (code >= 0x0900 && code <= 0x097f) return true; // Devanagari
  return false;
}

function tokenAtEnd(buffer) {
  let i = buffer.length - 1;
  while (i >= 0 && isWordChar(buffer[i])) i--;
  return buffer.slice(i + 1).toLowerCase();
}

/**
 * Split text into sentence + glue pairs that perfectly reconstruct the input.
 *
 * @param {string} text
 * @returns {{ sentences: string[], glue: string[] }}
 *   sentences[i] is followed by glue[i] in the original text.
 *   glue.length === sentences.length, last glue may be empty.
 */
export function splitSentences(text) {
  if (!text) return { sentences: [], glue: [] };

  const sentences = [];
  const glue = [];
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    buffer += ch;

    if (SENTENCE_TERMINATORS.has(ch)) {
      const next = text[i + 1];
      const isEnd = i === text.length - 1;
      const followedByBreak = !next || /\s/.test(next);

      if (followedByBreak || isEnd) {
        let avoid = false;
        if (ch === "." && !isEnd) {
          const tok = tokenAtEnd(buffer.slice(0, -1));
          if (tok && (ABBREVIATIONS.has(tok) || tok.length === 1)) avoid = true;
        }

        if (!avoid) {
          let g = "";
          let j = i + 1;
          while (j < text.length && /\s/.test(text[j])) {
            g += text[j];
            j++;
          }
          sentences.push(buffer);
          glue.push(g);
          buffer = "";
          i = j;
          continue;
        }
      }
    }

    i++;
  }

  if (buffer.length > 0) {
    sentences.push(buffer);
    glue.push("");
  }

  return { sentences, glue };
}

/**
 * Reverse of splitSentences. Reassembles translated sentences using the
 * original glue so spacing/line-breaks match the source layout.
 */
export function joinSentences(sentences, glue) {
  let out = "";
  for (let i = 0; i < sentences.length; i++) {
    out += sentences[i];
    out += glue[i] || "";
  }
  return out;
}

/**
 * Convenience: split, dedupe sentences for caching, return both the
 * unique-list (to translate) and a reassembly plan.
 */
export function planTranslation(text) {
  const { sentences, glue } = splitSentences(text);
  const unique = [];
  const seen = new Map();
  const indexes = [];

  for (const s of sentences) {
    const key = s.trim();
    if (!key) {
      indexes.push(-1);
      continue;
    }
    if (seen.has(key)) {
      indexes.push(seen.get(key));
    } else {
      seen.set(key, unique.length);
      indexes.push(unique.length);
      unique.push(s);
    }
  }

  return { sentences, glue, unique, indexes };
}
