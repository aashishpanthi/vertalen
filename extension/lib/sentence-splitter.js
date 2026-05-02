const SENTENCE_TERMINATORS = new Set([".", "!", "?", "।", "॥", "…"]);

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
  if (code >= 48 && code <= 57) return true;
  if (code >= 65 && code <= 90) return true;
  if (code >= 97 && code <= 122) return true;
  if (code >= 0x0900 && code <= 0x097f) return true;
  return false;
}

function tokenAtEnd(buffer) {
  let i = buffer.length - 1;
  while (i >= 0 && isWordChar(buffer[i])) i--;
  return buffer.slice(i + 1).toLowerCase();
}

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

export function joinSentences(sentences, glue) {
  let out = "";
  for (let i = 0; i < sentences.length; i++) {
    out += sentences[i];
    out += glue[i] || "";
  }
  return out;
}

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
