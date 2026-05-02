const VOCAB_URL = chrome.runtime.getURL("lib/vocab.json");

let cache = null;

export async function loadVocab() {
  if (cache) return cache;
  const resp = await fetch(VOCAB_URL);
  const raw = await resp.json();
  cache = raw.map(cleanEntry).filter(isUsable);
  return cache;
}

export function clearVocabCache() {
  cache = null;
}

export function cleanEntry(entry) {
  return {
    ...entry,
    en: entry.en,
    ne: collapseRepeats(entry.ne),
    tmg: collapseRepeats(entry.tmg),
  };
}

export function isUsable(entry) {
  if (!entry.en) return false;
  if (!entry.ne && !entry.tmg) return false;
  return true;
}

export function collapseRepeats(text) {
  if (!text) return "";
  const tokens = text
    .replace(/[।॥]\s*$/u, "")
    .trim()
    .split(/\s+/);
  if (tokens.length === 0) return "";
  if (tokens.length === 2 && tokens[0] === tokens[1]) return tokens[0];
  if (tokens.length === 3 && tokens[0] === tokens[1] && tokens[1] === tokens[2]) {
    return tokens[0];
  }
  return tokens.join(" ");
}
