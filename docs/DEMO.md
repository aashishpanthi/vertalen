# vertalen — Demo Script

A 5–6 minute walk-through that exercises every feature mentioned in the rubric. Use this as your video script or hand it to evaluators.

> **Lead with the story.** The first 30 seconds of your video should *not* show a feature — they should explain why this exists. See the opener below.

## 0. Setup (one-time, ~30 s)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select the `extension/` folder.
4. The vertalen welcome page opens automatically.
5. Paste your TMT team token (`team_xxxxxxxxxxxxxxxx`) and click **Save key**.
6. Pin the vertalen icon to the toolbar.

## 1. Opener (~30 s, voiceover)

> "Tamang has 1.3 million speakers, but you've probably never seen it on the web. UNESCO lists it as vulnerable. Most translation tools take you *away from* Tamang — they help you read English instead. **vertalen does the opposite**: it helps you read English while quietly teaching you Tamang along the way."

Now show the welcome page; mention the trinity logo (Latin V + Devanagari व).

## 2. Sample translation from onboarding (~30 s)

- On the welcome page, type _"Hello, how are you?"_ in the step-2 textarea.
- Pick **From: English → To: Nepali**.
- Click **Translate**.
- Output: `हेलो, कस्तो छ?`
- Switch and try Tamang: `Good morning, friend.` → Tamang.

This proves the API key works end-to-end.

## 3. Selection translation on a real page (~45 s)

- Open any English news article.
- Highlight a sentence — the floating **Translate** button slides in.
- Click it. Non-destructive tooltip with the Nepali translation.
- Click **Show original** to expand the original sentence.
- Click **Copy** — translation lands on your clipboard.
- Press <kbd>Esc</kbd> to dismiss.

## 4. Right-click and shortcut (~30 s)

- Highlight a sentence → right-click → **vertalen: translate selection → Translate to Tamang**.
- Same flow with <kbd>Alt</kbd> + <kbd>T</kbd> on a selection.

## 5. Full-page translation (~60 s)

- Open a Wikipedia article in English.
- Click the vertalen icon → **Translate this page**.
- Watch the progress badge: _"Translating 4/47"_, _"Translating 30/47"_, …
- Mid-flight, click **Cancel** — translation stops immediately and untranslated nodes stay English.
- Click **Translate this page** again to resume.

## 6. Side-by-side reader (~45 s)

- Open a long-form article (e.g. a Medium post).
- Click the vertalen icon → **Open in side-by-side reader**.
- New tab opens with two columns. Right column streams Nepali translations paragraph by paragraph.
- Switch the target to Tamang at the top right and click **Translate**.

## 7. **Immersion mode — the differentiator (~90 s)**

This is the section that wins the rubric. Take your time here.

- Open the popup. Switch to the **Learn** tab.
- If immersion is off: click **Turn on**.
- Reload any English news article (BBC, Wikipedia, anything text-heavy).
- Pause the video. Ask the audience: "Notice anything different on this page?"
- Zoom in: a few words have switched to Tamang, with a subtle dotted underline. The page is still 97% English.
- Hover one of them — it shows the English original.
- Click one — popover with **I know this** / **Show again**. Click **I know this**.
- Open the popup → **Learn** tab again.
  - Streak: 1
  - Words encountered: a small number
  - Quiz card: a multiple-choice round with the word you just saw.
- Answer correctly. Watch the daily-progress bar advance.
- Mention: "Every word I've learned is now stored locally. Tomorrow I'll see harder vocabulary."

## 8. Translation memory + export (~30 s)

- Open the popup → **Translate** tab — recent translations under *Recent*.
- Open **Settings** (gear icon).
- Translation memory card: count is non-zero now.
- Click **Export CSV** — `vertalen-memory-*.csv` lands in Downloads.

## 9. Settings tour (~30 s)

- **API key** card: *Test connection* (live API call).
- **Defaults** card: change source/target.
- **Immersion / learn** card: density slider, daily goal, target language switch, **Reset progress**.
- **Performance** card: rate-limit slider.

## 10. Closing shot (~15 s)

- Show the GitHub repo, LICENSE, and the GitHub Release with `vertalen-1.0.0.zip`.
- "Built in one weekend for the Google TMT Hackathon 2026, by Aashish Panthi. Open-source under MIT, ready to extend."

## Talking points to weave in

- Manifest V3, service-worker only API surface.
- API key stays in `chrome.storage.local` — never in the repo or release zip.
- 60 req/min API limit handled with a token-bucket queue at 55/min.
- Sentence splitter handles Devanagari `।` and abbreviation guards.
- Immersion's vocabulary is **pre-translated and shipped offline** so it makes zero API calls while you browse.
- Spaced-repetition algorithm based on SuperMemo-2 with confidence in `[0, 5]`.
- Built specifically for the trilingual mission of the TMT project — not adapted from a general-purpose translator.
