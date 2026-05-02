# vertalen — Trilingual TMT Translator + Tamang Learning Companion

> Built for the **Google TMT Hackathon 2026**, Track 1 (Browser Plugin / Extension).
> Two modes in one extension: a real-time **trilingual translator** between English, Nepali, and Tamang, and a passive **immersion learning** mode that helps you pick up Tamang vocabulary while you browse the web. Powered by the [Google TMT](https://tmt.ilprl.ku.edu.np/) machine translation system at Kathmandu University.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)](https://developer.chrome.com/docs/extensions/mv3/intro/) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why Tamang?

Tamang has roughly **1.3 million speakers** in Nepal and is on UNESCO's vulnerability list — most learners and even diaspora children grow up without ever encountering the language outside the home. Google's TMT project at Kathmandu University is one of very few credible MT systems for it. `vertalen`'s second mode treats every English webpage you read as an ambient classroom: it weaves a few Tamang (or Nepali) words into the page, hover-reveals the original, and turns daily browsing into a passive route to vocabulary acquisition. Translation alone is useful; *translation that helps preserve the language* is the actual mission.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Demo video](#demo-video)
3. [Quick install (for evaluators)](#quick-install-for-evaluators)
4. [Features](#features)
5. [Project structure](#project-structure)
6. [Architecture overview](#architecture-overview)
7. [Security &amp; privacy](#security--privacy)
8. [Development](#development)
9. [Building a release](#building-a-release)
10. [Evaluation rubric coverage](#evaluation-rubric-coverage)
11. [Roadmap](#roadmap)
12. [License](#license)

---

## What it does

`vertalen` (Dutch for "translate") is a Chrome extension that brings the TMT translation system to every web page you visit. It is intentionally non-destructive — it never deletes the original text without your consent — and ships with a complete first-run experience, an in-page reader mode, translation memory you can export, **and** a Toucan-style immersion mode that uses 200+ pre-translated common-English words to teach you Tamang or Nepali while you browse.

### Mode 1 — Trilingual translator

Supports all six TMT-defined language directions:

| From → To | Example |
|---|---|
| English → Nepali | `Hello, how are you?` → `हेलो, कस्तो छ?` |
| English → Tamang | `Good morning, friend.` → `ज्याबा स्ह्यो ह्रो।` |
| Nepali → English | `नेपाल एक सुन्दर देश हो।` → `Nepal is a beautiful country.` |
| Nepali → Tamang | `नमस्ते, कस्तो छ?` → `नमस्ते, खाराङ्बा मुला?` |
| Tamang → English | `ज्याबा स्ह्यो।` → `Good morning.` |
| Tamang → Nepali | `ज्याबा स्ह्यो।` → `शुभ प्रभात।` |

> The samples above were exercised against the live TMT API during development.

### Mode 2 — Immersion / learn

A passive language-learning layer:

- Replaces ~3% of common English words on the pages you read with their Tamang or Nepali equivalents.
- Hover any swapped word to see the English original; click for actions ("I know this" / "Show again").
- A spaced-repetition scheduler tracks your confidence per word and surfaces less-known words more often.
- A flashcard quiz inside the popup quizzes you on words you've already encountered.
- Streak counter, daily goal, and mastered-word count.
- Off by default; one click to enable from the welcome page or popup.

The vocabulary set ships pre-translated as `extension/lib/vocab.json` (~200 curated common-English words → Nepali + Tamang), so immersion mode makes **zero TMT API calls during normal browsing**. The pre-translation step uses `scripts/build-vocab.js`.

---

## Demo video

> Replace this placeholder with the GitHub Release asset URL or YouTube link before submission.

📹 **Demo:** _https://youtu.be/REPLACE_WITH_VIDEO_ID_

The video shows: install → API key entry → selection translation → full-page translation → side-by-side reader → settings.

---

## Quick install (for evaluators)

`vertalen` ships as an unpacked Chrome extension. **No build tools required.**

1. **Download** `vertalen-1.0.0.zip` from the GitHub Release page (or clone this repo).
2. Unzip the archive somewhere on disk.
3. Open Chrome and navigate to `chrome://extensions`.
4. Toggle **Developer mode** on (top-right).
5. Click **Load unpacked** and select the `extension/` folder inside the unzipped archive.
6. The vertalen welcome page opens automatically.
7. Paste your TMT team token (`team_xxxxxxxxxxxxxxxx`) and click **Save key**.
8. Try the sample translation on the welcome page to confirm everything works.

That's it. Pin the extension to your toolbar to use it everywhere.

> **Note:** the API token is **never** committed to this repository. Each team's token is private. Evaluators should use their own team token from the registration email. If you do not have a token, contact the TMT organizing team.

### Minimum requirements

- Chrome 114+ (for the latest Manifest V3 features)
- A valid TMT team token

---

## Features

### Core translation

- **Selection tooltip** — highlight any text on any page, click the floating translate button (or press <kbd>Alt</kbd> + <kbd>T</kbd>) and the translation appears in a non-destructive tooltip with a copy/retry action and the option to view the original.
- **Right-click menu** — translate selection to a specific target language without changing your default.
- **Full-page translate** — replaces every text node in place with a live progress bar and a Cancel button. The original text is preserved on hover via `data-vertalen-original`.
- **Side-by-side reader** — opens the current article in a new tab with the original on the left and the translation streaming in on the right, paragraph by paragraph.
- **Popup translator** — a quick textarea translator for ad-hoc snippets, with language picker, swap, copy, and a recent-translations history.

### Polish

- **All six language directions** supported, with automatic source detection using a Devanagari Unicode heuristic (Nepali / Tamang are disambiguated by user preference).
- **Sentence-level pipeline** that respects the API's "one sentence per request" rule. Custom splitter handles `.`, `!`, `?`, the Devanagari danda `।`, and the double danda `॥`, with abbreviation guards (Mr., Dr., U.S., e.g., …).
- **Streaming** — long pages render translation progressively, sentence by sentence.
- **Caching** — two-layer cache: in-memory LRU + persistent translation memory in `chrome.storage.local`. Repeat translations are free.
- **Export translation memory** to JSON or CSV from the options page.
- **History** of the last 50 translations (configurable).
- **Three keyboard shortcuts**: <kbd>Alt</kbd> + <kbd>T</kbd> (selection), <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> (page), <kbd>Alt</kbd> + <kbd>S</kbd> (swap defaults).
- **Dark mode** based on `prefers-color-scheme` across every UI surface.
- **Fluid layouts** — every popup, options panel, onboarding step, and reader column scales gracefully with viewport size and font size.
- **Onboarding flow** — a four-step welcome page that opens automatically on install.

### Reliability

- **Token-bucket rate limiting** at 55 req/min by default (configurable). The TMT API ceiling is 60/min; we leave headroom on purpose.
- **Exponential backoff with jitter** on 429 / 5xx with three retries per call.
- **AbortController support** end-to-end so cancelling a full-page translate stops in-flight requests.

### Immersion mode

- **Off by default.** First-run welcome page asks once.
- **Pre-translated vocabulary** — `vocab.json` ships in the extension. No API calls during browsing.
- **Spaced-repetition** (SuperMemo-2-inspired) tracks confidence in `[0, 5]` and surfaces words at the right time.
- **Three difficulty levels** — start with the 130 most common words, unlock harder vocabulary as you progress.
- **Density control** — 1–10% of matched words on a page get swapped, so the page stays readable.
- **Streak + daily goal** — gentle gamification without notifications or social pressure.
- **Flashcard quiz** in the popup pulls multiple-choice questions only from words you've already seen, so it always feels familiar.

---

## Project structure

```text
google-TMT/
├── extension/
│   ├── manifest.json              # Chrome MV3 manifest
│   ├── background/
│   │   └── service-worker.js      # Translation orchestrator + message bus
│   ├── content/
│   │   ├── content.js             # Selection detection, tooltip, full-page UX
│   │   └── tooltip.css            # Shadow-DOM-scoped styles
│   ├── popup/                     # Toolbar popup (translate, history, full-page)
│   ├── options/                   # Settings page (API key, defaults, TM, history)
│   ├── onboarding/                # First-run welcome flow
│   ├── reader/                    # Side-by-side reader for long articles
│   ├── lib/                       # Shared ES modules
│   │   ├── api.js                 # TMT API client (retry, timeouts, AbortSignal)
│   │   ├── cache.js               # Two-layer translation cache
│   │   ├── lang-detect.js         # Devanagari heuristic
│   │   ├── languages.js           # Language constants
│   │   ├── messages.js            # Runtime message types
│   │   ├── queue.js               # Token-bucket rate limiter
│   │   ├── sentence-splitter.js   # Multi-script sentence splitter
│   │   ├── srs.js                 # Spaced-repetition + streak (immersion)
│   │   ├── storage.js             # chrome.storage wrappers
│   │   ├── vocab-loader.js        # Vocabulary loader + post-processor
│   │   └── vocab.json             # 203 pre-translated EN→NE+TMG entries
│   ├── _locales/                  # i18n placeholder
│   └── icons/                     # 16 / 48 / 128 px PNGs
├── docs/
│   ├── ARCHITECTURE.md            # Deep dive into how the pieces fit
│   └── DEMO.md                    # Step-by-step demo script for evaluators
├── scripts/
│   ├── build-release.sh           # Creates release/vertalen-<version>.zip
│   └── build-vocab.js             # Pre-translates vocabulary via the TMT API
├── LICENSE                        # MIT
├── README.md                      # You are here
└── .gitignore
```

---

## Architecture overview

> See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the long version.

```text
                 ┌──────────────┐         ┌──────────────────┐
                 │  Popup / UI  │         │  Onboarding page │
                 └──────┬───────┘         └─────────┬────────┘
                        │ runtime.sendMessage        │
   ┌────────────────────▼────────────────────────────▼───────────────┐
   │                  Service worker (MV3)                           │
   │  - Holds API key in memory only                                 │
   │  - Token-bucket queue (55 req/min)                              │
   │  - Two-layer cache (LRU + chrome.storage TM)                    │
   │  - Sentence splitter -> per-sentence API calls                  │
   │  - Context menus, keyboard shortcuts                            │
   └────────────────────┬────────────────────────────────────────────┘
                        │ fetch (host_permissions only)
                        ▼
              https://tmt.ilprl.ku.edu.np/lang-translate
                        ▲
                        │ runtime.sendMessage
   ┌────────────────────┴────────────────────────────────────────────┐
   │  Content script (every page)                                    │
   │  - Detects selection, draws shadow-DOM tooltip                  │
   │  - Forwards translate requests to the worker                    │
   │  - Renders the in-page progress overlay during full-page jobs   │
   └─────────────────────────────────────────────────────────────────┘
```

Key design decisions:

- **The service worker is the only place that touches the API.** Every other surface (popup, options, content script, reader, onboarding) communicates via `chrome.runtime.sendMessage`. This keeps the key out of the page context.
- **No bundlers.** The extension uses native ES modules in the worker and HTML pages, and a single self-contained content script. `npm install` is not required to run or evaluate.
- **Shadow DOM for the tooltip** so vertalen's UI never inherits or pollutes a host page's CSS, even when the page uses aggressive global styles.
- **Sentence-level pipeline** because the API is sentence-only. The splitter returns a `glue` array so the joined output preserves the original whitespace exactly.

---

## Security &amp; privacy

- The TMT team token is stored in `chrome.storage.local` — never `chrome.storage.sync`. It never leaves the device unless the user explicitly chooses to.
- The token is **not** present in the source tree, in any `.env` file, or in release artifacts. Evaluators paste their own token at first run.
- The service worker is the only context that sees the token; content scripts, popup, and other UI surfaces never receive it.
- Outbound network calls are limited to `https://tmt.ilprl.ku.edu.np/*` via `host_permissions`. There is no analytics, telemetry, or third-party network call.
- Translation memory is stored locally and can be cleared in one click from the options page.

---

## Development

There is no build step. To iterate:

1. Clone the repository.
2. Run `chrome://extensions` and load `extension/` as an unpacked extension.
3. Edit any file and reload the extension from the same page (or click the refresh icon on the extension card).
4. To debug the service worker: click **Service worker** on the extension card.
5. To debug the content script: open DevTools on any page; the script runs in the isolated world.

For linting, the codebase is plain modern JavaScript (ES2022+) and conforms to default ESLint expectations. There is no transpilation.

---

## Building a release

```bash
./scripts/build-release.sh
```

This produces `release/vertalen-<version>.zip` ready to upload to a GitHub Release. The script:

1. Verifies the extension folder has no `apiKey`, `team_`, or `Bearer ` strings (defense-in-depth secret scan).
2. Bumps no version automatically — version is read from `manifest.json`.
3. Writes the zip with the `extension/` directory at the root, exactly the way Chrome wants for **Load unpacked**.

---

## Evaluation rubric coverage

| Criterion | How vertalen addresses it |
|---|---|
| **Functionality &amp; accuracy** | All six TMT directions, sentence-level splitter, custom abbreviation guards, retry on transient errors, abort support, plus an immersion learning layer |
| **Alignment with theme** | Built specifically for English / Nepali / Tamang. Immersion mode is a direct contribution to **Tamang language preservation** — the explicit mission of the TMT project at KU. Every UI surface uses Devanagari-aware fonts. |
| **Code quality &amp; architecture** | 16 modular ES modules with single-responsibility files, message-bus separation, JSDoc-style headers explaining intent. Two clearly separated runtime modes share a single `lib/` |
| **Documentation &amp; demo** | This README, an architecture deep-dive, a step-by-step demo script in `docs/DEMO.md`, and a video link |
| **System design &amp; deployment** | Zero-build install ("Load unpacked"), one-script release, MV3-compliant, key-rotation friendly via the options page |
| **User experience** | Non-destructive tooltip, dark mode, fluid layouts, onboarding flow, keyboard shortcuts, history, copy actions, immersion is opt-in with sensible defaults |

---

## Roadmap

- Firefox port (manifest tweak + `webextension-polyfill`)
- OCR support for image-only pages
- Sentence-level streaming via WebSocket if the TMT team adds it
- Glossary / "do not translate" terms (e.g. brand names)
- Optional cloud sync of translation memory via the user's own Google Drive
- Audio playback for Tamang vocabulary (recorded by native speakers, not TTS)
- Open the curated `vocab.json` to community contributions via PR
- Inline grammar tips for the most-encountered words

## Building the vocabulary

The shipped `extension/lib/vocab.json` contains 203 curated English words pre-translated to Nepali and Tamang. To regenerate it (e.g. after expanding the seed list in `scripts/build-vocab.js`):

```bash
TMT_API_KEY=team_xxxxxxxxxxxxxxxx node scripts/build-vocab.js
```

The script is incremental — it resumes from the existing `vocab.json` if interrupted — and respects the API's 60/min rate limit. A full regeneration of 200 words takes about 14 minutes of API time.

---

## License

[MIT](LICENSE) © 2026 Aashish Panthi

Built with care for the [Google TMT Hackathon 2026](https://tmt.ilprl.ku.edu.np/) at Kathmandu University. Every text translation routes through the official TMT API.
