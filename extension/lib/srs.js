/**
 * vertalen — spaced-repetition + progress tracking.
 *
 * A small SuperMemo-2-inspired scheduler tuned for an "ambient
 * immersion" use case where most reviews are passive (the user just
 * sees a word in context) rather than active (flashcard quiz). The
 * passive event nudges confidence very slightly; the active answer
 * adjusts it more, the way an SRS would.
 *
 * Confidence is bounded to [0, 5]:
 *   0 — never seen
 *   1 — encountered, no commitment
 *   2 — recognized once
 *   3 — recognized multiple times in context
 *   4 — actively recalled at least once in a quiz
 *   5 — mastered (drops out of rotation)
 *
 * The "due" time tells the immersion picker whether this word is a
 * good candidate to surface again. A mastered word with a due time
 * far in the future is rarely chosen.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const INTERVALS = [
  0,
  6 * 60 * 60 * 1000,
  ONE_DAY_MS,
  3 * ONE_DAY_MS,
  7 * ONE_DAY_MS,
  21 * ONE_DAY_MS,
];

export function emptyState() {
  return {
    cards: {},
    streak: { count: 0, lastDay: null },
    daily: { date: null, learned: 0 },
    totalsSeen: 0,
  };
}

function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function nextInterval(level) {
  const idx = Math.max(0, Math.min(level, INTERVALS.length - 1));
  return INTERVALS[idx];
}

function ensureCard(state, word) {
  if (!state.cards[word]) {
    state.cards[word] = {
      seen: 0,
      hovered: 0,
      reviewed: 0,
      confidence: 0,
      lastSeen: 0,
      due: 0,
      learnedAt: null,
    };
  }
  return state.cards[word];
}

function rollDaily(state, now) {
  const today = todayKey(now);
  if (state.daily.date !== today) {
    if (state.daily.date) {
      const gap = Math.floor(
        (new Date(today).getTime() - new Date(state.daily.date).getTime()) /
          ONE_DAY_MS,
      );
      if (gap === 1) {
        state.streak.count = (state.streak.count || 0) + 1;
      } else if (gap > 1) {
        state.streak.count = 0;
      }
    }
    state.streak.lastDay = today;
    state.daily = { date: today, learned: 0 };
  }
}

/**
 * @param {object} state
 * @param {string} word - lowercase English headword
 * @param {"shown"|"hovered"|"correct"|"again"|"skip"} action
 * @param {number} now
 */
export function record(state, word, action, now = Date.now()) {
  rollDaily(state, now);
  const card = ensureCard(state, word);
  card.lastSeen = now;
  state.totalsSeen += 1;

  switch (action) {
    case "shown": {
      card.seen += 1;
      if (card.confidence < 1) card.confidence = 1;
      card.due = now + nextInterval(card.confidence);
      break;
    }
    case "hovered": {
      card.hovered += 1;
      card.confidence = Math.min(5, card.confidence + 0.25);
      card.due = now + nextInterval(Math.floor(card.confidence));
      break;
    }
    case "correct": {
      card.reviewed += 1;
      const wasNew = card.confidence < 3;
      card.confidence = Math.min(5, card.confidence + 1);
      if (wasNew && card.confidence >= 3) {
        state.daily.learned += 1;
        card.learnedAt = card.learnedAt || now;
      }
      card.due = now + nextInterval(Math.floor(card.confidence));
      break;
    }
    case "again": {
      card.reviewed += 1;
      card.confidence = Math.max(1, card.confidence - 1);
      card.due = now + nextInterval(Math.floor(card.confidence));
      break;
    }
    case "skip":
    default:
      break;
  }
  return state;
}

export function summary(state, now = Date.now()) {
  rollDaily(state, now);
  let mastered = 0;
  let learning = 0;
  let seen = 0;
  for (const card of Object.values(state.cards)) {
    if (card.confidence >= 5) mastered += 1;
    else if (card.confidence >= 3) learning += 1;
    if (card.confidence > 0) seen += 1;
  }
  return {
    streak: state.streak.count || 0,
    learnedToday: state.daily.learned || 0,
    seen,
    learning,
    mastered,
    total: Object.keys(state.cards).length,
    totalsSeen: state.totalsSeen || 0,
  };
}

/**
 * Pick which entries to surface in immersion. Newer words are
 * favored; mastered words are skipped most of the time. Returns a
 * shuffled list capped at `limit`.
 */
export function pickCandidates(state, vocab, { limit = 80, now = Date.now() } = {}) {
  const scored = vocab.map((entry) => {
    const card = state.cards[entry.en.toLowerCase()];
    let score = Math.random() * 0.4 + 0.4;
    if (card) {
      const dueIn = card.due - now;
      if (card.confidence >= 5) score *= 0.05;
      else if (card.confidence >= 3 && dueIn > 0) score *= 0.4;
      else if (card.confidence >= 1) score += 0.2;
    } else {
      score += 0.3;
    }
    return { entry, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * Pick a single word for a quiz round. Prefers words the user has
 * encountered passively (confidence 1–4) so the quiz feels familiar
 * rather than random.
 */
export function pickQuizWord(state, vocab, now = Date.now()) {
  const candidates = vocab.filter((entry) => {
    const c = state.cards[entry.en.toLowerCase()];
    if (!c) return false;
    if (c.confidence >= 5) return false;
    return c.seen >= 1;
  });
  const pool = candidates.length ? candidates : vocab;
  if (!pool.length) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

export function buildQuizRound(state, vocab, target = "tmg") {
  const word = pickQuizWord(state, vocab);
  if (!word) return null;
  const distractors = [];
  const seen = new Set([word.en.toLowerCase()]);
  while (distractors.length < 3 && distractors.length < vocab.length - 1) {
    const cand = vocab[Math.floor(Math.random() * vocab.length)];
    if (seen.has(cand.en.toLowerCase())) continue;
    if (!cand[target]) continue;
    seen.add(cand.en.toLowerCase());
    distractors.push(cand);
  }
  if (distractors.length < 3) return null;
  const choices = [word, ...distractors]
    .map((c) => ({ en: c.en, value: c[target] || "?" }))
    .sort(() => Math.random() - 0.5);
  return {
    prompt: word.en,
    target,
    correct: word[target] || "?",
    choices,
  };
}
