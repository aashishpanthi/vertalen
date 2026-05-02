# vertalen — Architecture

This document is for contributors and reviewers who want to understand how the pieces fit together.

## High-level

`vertalen` is a Chrome Manifest V3 extension. There is no bundler and no transpiler; the code is plain modern JavaScript organized as ES modules. Five surfaces communicate over `chrome.runtime` messages:

| Surface | Lives at | Purpose |
|---|---|---|
| **Service worker** | `background/service-worker.js` | The only context that holds the API key and calls the TMT endpoint. Owns rate limiting, caching, sentence splitting, context menus, keyboard shortcuts. |
| **Content script** | `content/content.js` | Runs on every web page (as an ES module); renders the floating selection button, tooltip, and full-page progress overlay. Consults `site-blocklist.js` and waits for `window` `load` before starting immersion. |
| **Popup** | `popup/popup.html` | Toolbar UI for ad-hoc translation, full-page trigger, and recent history. |
| **Options page** | `options/options.html` | API key entry, defaults, behavior toggles, performance, translation-memory and history management, About. |
| **Onboarding** | `onboarding/welcome.html` | First-run flow that opens automatically on install: paste key, run a sample, learn the gestures. |
| **Reader** | `reader/reader.html` | Standalone tab that shows article content side-by-side with its translation, streaming sentence by sentence. |

Only the service worker sees the API key. Everything else makes requests through messages so the key never enters page context, MV3 isolated content-script context, or the network call site for any other surface.

## Files in `lib/`

These are the shared modules consumed by every ES-module surface (worker, popup, options, onboarding, reader).

### `api.js`

Wraps `fetch()` to the TMT endpoint with:

- Input validation (early return on missing/duplicate language).
- Custom `TMTError` class with `kind` (auth / bad_request / rate_limit / server / unknown) and `retryable` boolean.
- HTTP error classification — turns 401/400/429/5xx into typed errors.
- Body validation — even a 200 with `message_type === "FAIL"` becomes a `TMTError`.
- Exponential backoff with jitter (500ms × 2^attempt) on retryable errors.
- `AbortSignal` support for cancellation.

### `queue.js`

Token-bucket rate limiter with three priority lanes:

- **Interactive** — selection/popup/reader translations.
- **Page** — full-page batches.
- **Background** — anything you want to delay.

Configurable `requestsPerMinute`, `concurrency`, and `minSpacingMs`. The bucket refills smoothly (continuous rate) so we don't burst above the ceiling at the start of each minute. Aborted items are skipped on the way out.

### `sentence-splitter.js`

The TMT API requires one sentence per call. The splitter:

- Walks the input character by character, emitting a sentence on `.` `!` `?` `।` `॥` `…` followed by whitespace or EOF.
- Records "glue" (the whitespace between sentences) so the reassembler reconstructs the original layout exactly.
- Uses an abbreviation list (Mr., Dr., U.S., e.g., …) and a single-letter heuristic to avoid false splits inside abbreviations.
- Detects Devanagari word characters (U+0900–U+097F) so abbreviations behave the same in Nepali / Tamang text.

`planTranslation()` deduplicates identical sentences before sending so a long page that repeats a paragraph still only spends one API call per unique sentence.

### `lang-detect.js`

Counts Devanagari vs Latin letters and returns:

- `"eng"` if Latin dominates,
- `"nep"` or `"tmg"` (based on the user's hint) if Devanagari dominates,
- `null` otherwise (e.g. all numbers / emoji).

Devanagari can't be uniquely attributed to Nepali vs Tamang from glyphs alone; the caller resolves that based on the configured target language or user preference.

### `site-blocklist.js`

Shared rules for **where not** to run immersion, full-page translate, reader, or on-page selection translation:

- **Search URLs** — `google.*` with path `/search`, Bing `/search`, Yahoo (`search.yahoo.com` or `*.yahoo.com` with `/search`), and all of `duckduckgo.com`.
- **Host suffix list** — defaults include major social / video / messaging domains (Facebook, YouTube, Reddit, etc.); users can edit the list in options (`translateBlockedHosts`) or disable the feature with `translateBlocklistEnabled`.
- **Bot / challenge pages** — lightweight DOM heuristics (title tokens, Cloudflare challenge nodes) so “Checking your browser” interstitials are not fed through the immersion walker.

Popup-only translation (textarea) does not consult this list.

### `cache.js`

Two layers:

1. **In-memory LRU** (capacity 750). Lives only as long as the service worker is alive (Chrome may stop and restart it).
2. **Persistent TM** in `chrome.storage.local` keyed by `srcCode|tgtCode|inputText`.

The worker checks the LRU first, then the TM, then the network. Successful network responses write through to both layers.

### `storage.js`

Promise wrappers around `chrome.storage.local` with sensible defaults:

```js
DEFAULT_SETTINGS = {
  defaultSrc: "eng",
  defaultTgt: "nep",
  autoDetectSrc: true,
  showFloatingButton: true,
  inlineTooltip: true,
  theme: "auto",
  rateLimitPerMinute: 55,
  maxHistory: 50,
  enableTranslationMemory: true,
  fullPagePreserveOriginal: true,
  fullPageStreamRender: true,
  immersionEnabled: true,
  immersionTarget: "tmg",
  immersionMaxLevel: 1,
  immersionDensity: 3,
  immersionDailyGoal: 5,
  translateBlocklistEnabled: true,
  translateBlockedHosts: [ /* built-in suffixes from site-blocklist.js */ ],
};
```

History is capped at `maxHistory`. The TM has no cap (export and clear from options if it grows too large).

### `languages.js` &amp; `messages.js`

Pure constants, no logic. Imported everywhere to keep magic strings out of the rest of the codebase.

### `srs.js` (immersion)

A small SuperMemo-2-inspired scheduler tuned for ambient learning. Confidence is in `[0, 5]`:

- 0: never seen
- 1: encountered, no commitment
- 2: recognized once
- 3: recognized in context multiple times
- 4: actively recalled in a quiz
- 5: mastered, drops out of rotation

Events tracked per word: `shown` (passive surface), `hovered`, `correct` (active recall), `again` (forgot). Each event nudges confidence and computes a `due` timestamp. The picker (`pickCandidates`) ranks words by score combining "due-ness", existing confidence, and randomness so the next page surface always feels varied.

Daily streak: increments when `learnedToday > 0` on a new day that follows a learned day, resets on gaps.

### `vocab-loader.js` and `vocab.json` (immersion)

`vocab.json` is generated by `scripts/build-vocab.js`. Each entry is shaped:

```json
{
  "en": "tomorrow",
  "category": "time",
  "level": 1,
  "ne": "भोलिपल्ट",
  "tmg": "न्हाङ्गार",
  "flagged": false
}
```

`vocab-loader.js` post-processes the raw JSON at runtime:

- Collapses repeated tokens (the API sometimes returns `"हेलो हेलो"` for `hello`; we keep the first instance).
- Strips trailing `।` / `॥` from Devanagari output.
- Filters out entries that are empty for the target language.

The loader caches the result in memory to keep immersion startup snappy.

## Immersion mode pipeline

1. After the tab fires `window` **`load`** (document `readyState === "complete"`), `content.js` checks `shouldSkipImmersivePage` (blocklist + Cloudflare-style interstitials). If the URL is allowed, it calls `IMMERSION_BOOTSTRAP`.
2. The service worker:
   - Checks `immersionEnabled` setting → returns `{ enabled: false }` early if off.
   - Loads `vocab.json` via `vocab-loader.js`, filters to entries that have the active target translation and are within the configured `immersionMaxLevel`.
   - Loads SRS state from `chrome.storage.local`.
   - Calls `pickCandidates(state, vocab)` to score and shuffle 120 candidates.
   - Returns the entries (English + translation + level + category) to the content script.
3. `content.js` builds a longest-match-first lookup, walks the page text nodes (skipping `<a>`, `<code>`, etc.), finds matches at word boundaries, picks `density%` of them per text node up to a per-page cap, and replaces those tokens with `<span class="vertalen-imm">` elements.
4. Each created span fires `IMMERSION_RECORD` with `action="shown"` so SRS can advance confidence.
5. Hovering fires `action="hovered"` (small confidence bump). Clicking opens a popover with **I know this** (`action="correct"`) and **Show again** (`action="again"`).
6. A `MutationObserver` keeps watching for newly-loaded content (single-page apps, infinite scrolls) and immerses additions until the per-page cap is hit.

Cancellation / teardown: when the user toggles immersion off, `content.js` walks every `[data-vertalen-imm]` and replaces it with a text node containing the original English. No reload required.

## Quiz pipeline

1. The popup `Learn` tab calls `LEARN_QUIZ_DRAW`.
2. The service worker calls `buildQuizRound(state, vocab, target)`:
   - Picks a word the user has already encountered (confidence 1–4) so quizzes feel familiar.
   - Selects three random distractors from the vocabulary.
   - Returns `{ prompt, target, correct, choices }` shuffled.
3. The popup renders multiple-choice buttons.
4. On answer, the popup calls `LEARN_QUIZ_ANSWER` which routes to `srsRecord` with `correct` or `again`.

## Message contract

All `chrome.runtime.sendMessage` calls use one of the constants in `messages.js`:

| Message | Direction | Payload | Response |
|---|---|---|---|
| `vertalen/translate_text` | UI → worker | `{ text, src?, tgt?, source }` | `{ ok, output, src, tgt }` |
| `vertalen/translate_batch` | UI → worker | `{ items, src, tgt }` | `{ ok, results: [{ ok, output|error }] }` |
| `vertalen/translate_page` | popup → worker | `{ tabId?, src, tgt }` | `{ ok }` (results stream via PAGE_PROGRESS) |
| `vertalen/cancel_page` | UI → worker | `{ tabId? }` | `{ ok }` |
| `vertalen/page_progress` | worker → content | `{ stage, translated, total, error? }` | n/a (event) |
| `vertalen/open_reader` | UI → worker | `{ tabId? }` | `{ ok }` |
| `vertalen/get_settings` | any → worker | n/a | `{ ok, settings }` |
| `vertalen/set_settings` | any → worker | `{ patch }` | `{ ok, settings }` |
| `vertalen/get_api_status` | UI → worker | n/a | `{ ok, hasKey, keyMasked }` |
| `vertalen/get_history` | UI → worker | n/a | `{ ok, history }` |
| `vertalen/clear_history` | UI → worker | n/a | `{ ok }` |
| `vertalen/export_tm` | UI → worker | n/a | `{ ok, tm }` |
| `vertalen/translate-current-selection` | worker → content | n/a | n/a (event) |

## Full-page translation pipeline

1. Popup or shortcut sends `translate_page` with the active tab id.
2. Worker calls `chrome.scripting.executeScript({ func: collectTextNodes })` in the page. The function:
   - Walks `document.body` with a `TreeWalker` filtering on `SHOW_TEXT`.
   - Skips `script`, `style`, `code`, form controls, contenteditable, `translate="no"`, etc.
   - Wraps each accepted text node in a `<span data-vertalen-node="vt-N" data-vertalen-original="…">` so we can address it later.
   - Returns `[{ id, text }]`.
3. Worker dispatches each node text into the queue (Page priority, parallel up to `concurrency`).
4. For each completed sentence, the worker calls `chrome.scripting.executeScript({ func: applyTranslatedNode, args: [id, output] })` to swap the span's text content. The original is kept on `data-vertalen-original`.
5. After every node, the worker sends a `page_progress` message to the tab so the content script can update the floating progress badge.
6. Cancellation: the popup or content script sends `cancel_page`. The worker calls `abort.abort()` on the active job; in-flight `fetch()` calls receive `AbortError` and unwind.

## Reader pipeline

1. The user clicks **Open in side-by-side reader**.
2. The worker runs `extractReadableContent` in the active tab. It collects `h1, h2, h3, h4, p, li, blockquote` from `<article>`/`<main>` (or body), filters out `<nav>` / `<aside>` / `<footer>`, and returns `{ title, url, blocks: [{ tag, text }] }`.
3. The worker opens `reader.html?d=<encoded JSON>` in a new tab.
4. The reader page renders the original on the left, then issues one `translate_text` per block in parallel and streams results into the right column. Cancellation aborts in-flight calls.

## Why this design

- **Sentence-level API + page-level intent.** The splitter and the queue together turn the API's awkward sentence-by-sentence shape into a UX that feels paragraph-aware.
- **Defense in depth on the key.** Service worker only, no `.env`, no public release with the key, options page is the single source of truth.
- **No build complexity.** Evaluators load unpacked, the source matches the running code, and there's no risk of a release artifact diverging from the repo.
- **Cancellable everywhere.** AbortController flows from the user gesture down to `fetch`, so a long full-page job never feels stuck.
