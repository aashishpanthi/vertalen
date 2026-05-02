import { MSG } from "../lib/messages.js";
import { LANGUAGE_LIST, getLanguage, isPairSupported } from "../lib/languages.js";
import { detect } from "../lib/lang-detect.js";
import { isUrlBlockedForVertalen } from "../lib/site-blocklist.js";
import { Storage } from "../lib/storage.js";

const els = {
  srcLang: document.getElementById("srcLang"),
  tgtLang: document.getElementById("tgtLang"),
  swap: document.getElementById("swap"),
  input: document.getElementById("input"),
  output: document.getElementById("output"),
  translate: document.getElementById("translate"),
  copy: document.getElementById("copy"),
  charCount: document.getElementById("charCount"),
  detected: document.getElementById("detectedLang"),
  translatePage: document.getElementById("translatePage"),
  openReader: document.getElementById("openReader"),
  openOptions: document.getElementById("openOptions"),
  warningKey: document.getElementById("warningKey"),
  warningOpenOptions: document.getElementById("warningOpenOptions"),
  quickKeyForm: document.getElementById("quickKeyForm"),
  quickKey: document.getElementById("quickKey"),
  quickKeySave: document.getElementById("quickKeySave"),
  quickKeyHint: document.getElementById("quickKeyHint"),
  history: document.getElementById("historyList"),
  historyEmpty: document.getElementById("historyEmpty"),
  clearHistory: document.getElementById("clearHistory"),

  tabTranslate: document.getElementById("tabTranslate"),
  tabLearn: document.getElementById("tabLearn"),
  paneTranslate: document.getElementById("paneTranslate"),
  paneLearn: document.getElementById("paneLearn"),
  immersionToggleCard: document.getElementById("immersionToggleCard"),
  immersionToggleDesc: document.getElementById("immersionToggleDesc"),
  immersionSwitch: document.getElementById("immersionSwitch"),
  streakCount: document.getElementById("streakCount"),
  learnedToday: document.getElementById("learnedToday"),
  learnMastered: document.getElementById("learnMastered"),
  dailyGoal: document.getElementById("dailyGoal"),
  dailyFill: document.getElementById("dailyFill"),
  dailyCaption: document.getElementById("dailyCaption"),
  quizCard: document.getElementById("quizCard"),
  quizBody: document.getElementById("quizBody"),
  quizLang: document.getElementById("quizLang"),
  quizSkip: document.getElementById("quizSkip"),
  quizNew: document.getElementById("quizNew"),
  learnSettings: document.getElementById("learnSettings"),
};

const state = {
  settings: null,
  loading: false,
};

const BLOCKED_TAB =
  "This tab is on vertalen's blocklist (search engines, social sites, or your custom list). Open Settings → Blocked sites to change it.";

init();

async function init() {
  await Promise.all([loadSettings(), checkApiKey(), refreshHistory()]);
  bindEvents();
  els.input.focus();
}

async function loadSettings() {
  const resp = await sendMessage({ type: MSG.GET_SETTINGS });
  state.settings = resp?.settings || {};
  els.srcLang.value = state.settings.defaultSrc || "eng";
  els.tgtLang.value = state.settings.defaultTgt || "nep";
  guardPair();
  syncImmersionToggleUI(Boolean(state.settings.immersionEnabled));
  if (!els.paneLearn.hidden) refreshLearnPane();
}

async function checkApiKey() {
  const apiKey = await Storage.getApiKey();
  const ok = Boolean(apiKey);
  els.warningKey.hidden = ok;
  els.translate.disabled = !ok;
  els.translatePage.disabled = !ok;
  els.openReader.disabled = !ok;
}

function bindEvents() {
  els.swap.addEventListener("click", swap);
  els.translate.addEventListener("click", runTranslate);
  els.copy.addEventListener("click", copyOutput);
  els.translatePage.addEventListener("click", runPageTranslate);
  els.openReader.addEventListener("click", runReader);
  els.openOptions.addEventListener("click", openOptions);
  els.warningOpenOptions.addEventListener("click", openOptions);
  els.clearHistory.addEventListener("click", clearHistory);
  els.input.addEventListener("input", onInput);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runTranslate();
    }
  });
  for (const select of [els.srcLang, els.tgtLang]) {
    select.addEventListener("change", () => {
      guardPair();
      saveDefaults();
    });
  }

  els.tabTranslate.addEventListener("click", () => switchTab("translate"));
  els.tabLearn.addEventListener("click", () => switchTab("learn"));
  els.immersionSwitch.addEventListener("change", onImmersionToggle);
  els.quizSkip.addEventListener("click", () => loadQuiz());
  els.quizNew.addEventListener("click", () => loadQuiz());
  els.learnSettings.addEventListener("click", openOptions);
  els.quickKeyForm.addEventListener("submit", onQuickKeySave);

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.apiKey) checkApiKey();
    if (changes.settings) loadSettings();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkApiKey();
  });
  window.addEventListener("focus", checkApiKey);
}

async function onQuickKeySave(e) {
  e.preventDefault();
  const value = (els.quickKey.value || "").trim();
  if (!value) {
    showQuickKeyHint("Paste your token first.", "err");
    return;
  }
  try {
    els.quickKeySave.disabled = true;
    showQuickKeyHint("Saving…", "busy");
    await Storage.setApiKey(value);
    els.quickKey.value = "";
    showQuickKeyHint("Saved.", "ok");
    await checkApiKey();
  } catch (err) {
    showQuickKeyHint(err?.message || "Could not save.", "err");
  } finally {
    els.quickKeySave.disabled = false;
  }
}

function showQuickKeyHint(text, tone) {
  els.quickKeyHint.textContent = text;
  els.quickKeyHint.dataset.tone = tone || "";
  els.quickKeyHint.hidden = !text;
}

function switchTab(name) {
  const learn = name === "learn";
  els.tabTranslate.classList.toggle("tab--active", !learn);
  els.tabLearn.classList.toggle("tab--active", learn);
  els.tabTranslate.setAttribute("aria-selected", String(!learn));
  els.tabLearn.setAttribute("aria-selected", String(learn));
  els.paneTranslate.hidden = learn;
  els.paneLearn.hidden = !learn;
  if (learn) refreshLearnPane();
}

async function refreshLearnPane() {
  const { settings } = state;
  const enabled = Boolean(settings?.immersionEnabled);
  syncImmersionToggleUI(enabled);

  const target = settings?.immersionTarget || "tmg";
  els.quizLang.textContent = target === "tmg" ? "Tamang" : "Nepali";
  els.dailyGoal.textContent = String(settings?.immersionDailyGoal || 5);

  if (!enabled) {
    els.streakCount.textContent = "0";
    els.learnedToday.textContent = "0";
    els.learnMastered.textContent = "0";
    els.dailyFill.style.width = "0%";
    els.dailyCaption.textContent =
      "Flip the switch above to turn immersion on. We'll start surfacing words as you browse.";
    els.quizBody.innerHTML =
      '<p class="quiz__hint">Turn on immersion above to unlock the quiz.</p>';
    return;
  }

  const stats = await sendMessage({ type: MSG.IMMERSION_STATS });
  const summary = stats?.summary || {};
  els.streakCount.textContent = String(summary.streak || 0);
  els.learnedToday.textContent = String(summary.learnedToday || 0);
  els.learnMastered.textContent = String(summary.mastered || 0);
  const goal = Math.max(1, settings?.immersionDailyGoal || 5);
  const pct = Math.min(100, Math.round(((summary.learnedToday || 0) / goal) * 100));
  els.dailyFill.style.width = `${pct}%`;
  els.dailyCaption.textContent =
    pct >= 100
      ? `You hit your daily goal of ${goal} words.`
      : `Browse pages, hover words, click "I know this" to advance.`;

  loadQuiz();
}

function syncImmersionToggleUI(enabled) {
  els.immersionSwitch.checked = enabled;
  els.immersionToggleCard.dataset.active = String(enabled);
  els.immersionToggleDesc.textContent = enabled
    ? "On — random English words on pages will appear in your target language."
    : "Off — pages stay in their original language.";
}

async function onImmersionToggle(e) {
  const enabled = Boolean(e.target.checked);
  syncImmersionToggleUI(enabled);
  const resp = await sendMessage({
    type: MSG.SET_SETTINGS,
    patch: { immersionEnabled: enabled },
  });
  if (resp?.settings) state.settings = resp.settings;
  refreshLearnPane();
}

async function loadQuiz() {
  const target = state.settings?.immersionTarget || "tmg";
  els.quizBody.innerHTML = '<p class="quiz__hint">Loading…</p>';
  const resp = await sendMessage({ type: MSG.LEARN_QUIZ_DRAW, target });
  if (!resp?.ok || !resp.round) {
    els.quizBody.innerHTML = `<p class="quiz__hint">${resp?.error || "Browse a few pages with immersion on to unlock the quiz."}</p>`;
    return;
  }
  renderQuizRound(resp.round);
}

function renderQuizRound(round) {
  els.quizBody.innerHTML = "";
  const prompt = document.createElement("p");
  prompt.className = "quiz__prompt";
  prompt.textContent = round.prompt;
  els.quizBody.appendChild(prompt);

  const caption = document.createElement("p");
  caption.className = "quiz__hint";
  caption.textContent = `Pick the ${round.target === "tmg" ? "Tamang" : "Nepali"} word.`;
  els.quizBody.appendChild(caption);

  const grid = document.createElement("div");
  grid.className = "quiz__choices";
  for (const choice of round.choices) {
    const btn = document.createElement("button");
    btn.className = "quiz__choice";
    btn.type = "button";
    btn.textContent = choice.value;
    btn.addEventListener("click", () => onQuizAnswer(round, choice, btn));
    grid.appendChild(btn);
  }
  els.quizBody.appendChild(grid);
}

async function onQuizAnswer(round, choice, btn) {
  const correct = choice.value === round.correct;
  btn.classList.add(correct ? "quiz__choice--correct" : "quiz__choice--wrong");
  if (!correct) {
    const buttons = els.quizBody.querySelectorAll(".quiz__choice");
    for (const b of buttons) {
      if (b.textContent === round.correct) b.classList.add("quiz__choice--correct");
    }
  }
  for (const b of els.quizBody.querySelectorAll(".quiz__choice")) {
    b.disabled = true;
  }
  await sendMessage({
    type: MSG.LEARN_QUIZ_ANSWER,
    word: round.prompt,
    correct,
  });
  setTimeout(() => {
    refreshLearnPane();
  }, correct ? 700 : 1500);
}

function onInput() {
  const text = els.input.value;
  els.charCount.textContent = `${text.length} chars`;
  if (state.settings?.autoDetectSrc && text.trim().length > 0) {
    const detected = detect(text, els.tgtLang.value === "tmg" ? "nep" : "tmg");
    const lang = detected ? getLanguage(detected) : null;
    if (lang) {
      els.detected.hidden = false;
      els.detected.textContent = `Detected: ${lang.name}`;
      if (els.srcLang.value !== lang.code) {
        els.srcLang.value = lang.code;
        guardPair();
      }
    } else {
      els.detected.hidden = true;
    }
  } else {
    els.detected.hidden = true;
  }
}

function guardPair() {
  if (els.srcLang.value === els.tgtLang.value) {
    const opts = ["eng", "nep", "tmg"];
    const next = opts.find((c) => c !== els.srcLang.value);
    els.tgtLang.value = next;
  }
}

function swap() {
  const s = els.srcLang.value;
  els.srcLang.value = els.tgtLang.value;
  els.tgtLang.value = s;
  saveDefaults();
  if (els.input.value && els.output.dataset.translated) {
    els.input.value = els.output.dataset.translated;
    setOutput("", { placeholder: true });
    onInput();
  }
}

async function saveDefaults() {
  await sendMessage({
    type: MSG.SET_SETTINGS,
    patch: { defaultSrc: els.srcLang.value, defaultTgt: els.tgtLang.value },
  });
}

async function runTranslate() {
  const text = els.input.value.trim();
  if (!text) return;
  if (!isPairSupported(els.srcLang.value, els.tgtLang.value)) {
    setOutput("Source and target must differ.", { error: true });
    return;
  }
  setLoading(true);
  setOutput("", { busy: true });
  const resp = await sendMessage({
    type: MSG.TRANSLATE_TEXT,
    text,
    src: els.srcLang.value,
    tgt: els.tgtLang.value,
    source: "popup",
  });
  setLoading(false);
  if (!resp?.ok) {
    setOutput(resp?.error || "Translation failed.", { error: true });
    return;
  }
  setOutput(resp.output, {});
  els.copy.disabled = false;
  els.output.dataset.translated = resp.output;
  refreshHistory();
}

async function runPageTranslate() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  if (tab.url && isUrlBlockedForVertalen(tab.url, state.settings || {})) {
    alert(BLOCKED_TAB);
    return;
  }
  await sendMessage({
    type: MSG.TRANSLATE_PAGE,
    tabId: tab.id,
    src: els.srcLang.value,
    tgt: els.tgtLang.value,
  });
  window.close();
}

async function runReader() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  if (tab.url && isUrlBlockedForVertalen(tab.url, state.settings || {})) {
    alert(BLOCKED_TAB);
    return;
  }
  await sendMessage({ type: MSG.OPEN_READER, tabId: tab.id });
  window.close();
}

async function copyOutput() {
  const text = els.output.dataset.translated || els.output.textContent;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  flashCopy();
}

function flashCopy() {
  const original = els.copy.textContent;
  els.copy.textContent = "Copied";
  setTimeout(() => {
    els.copy.textContent = original;
  }, 1200);
}

function setLoading(loading) {
  state.loading = loading;
  els.translate.disabled = loading;
  els.translate.textContent = loading ? "Translating…" : "Translate";
}

function setOutput(text, { error, placeholder, busy } = {}) {
  els.output.textContent = "";
  els.output.classList.toggle("translate-card__output--error", Boolean(error));
  els.output.setAttribute("aria-busy", busy ? "true" : "false");
  if (placeholder) {
    const span = document.createElement("span");
    span.className = "translate-card__placeholder";
    span.textContent = "Translation will appear here.";
    els.output.appendChild(span);
    delete els.output.dataset.translated;
    els.copy.disabled = true;
    return;
  }
  if (busy) {
    const span = document.createElement("span");
    span.textContent = "Translating…";
    els.output.appendChild(span);
    return;
  }
  if (error) {
    els.output.style.color = "var(--error)";
  } else {
    els.output.style.color = "";
  }
  els.output.textContent = text;
}

async function refreshHistory() {
  const resp = await sendMessage({ type: MSG.GET_HISTORY });
  const history = resp?.history || [];
  els.history.innerHTML = "";
  if (history.length === 0) {
    els.historyEmpty.hidden = false;
    return;
  }
  els.historyEmpty.hidden = true;
  for (const entry of history.slice(0, 10)) {
    const li = document.createElement("li");
    li.className = "history__item";
    li.innerHTML = `
      <div class="history__item__pair"></div>
      <div class="history__item__output"></div>
      <div class="history__item__input"></div>
    `;
    li.querySelector(".history__item__pair").textContent =
      `${codeToLabel(entry.src)} → ${codeToLabel(entry.tgt)}`;
    li.querySelector(".history__item__output").textContent = entry.output;
    li.querySelector(".history__item__input").textContent = entry.input;
    li.addEventListener("click", () => {
      els.input.value = entry.input;
      els.srcLang.value = entry.src;
      els.tgtLang.value = entry.tgt;
      onInput();
      runTranslate();
    });
    els.history.appendChild(li);
  }
}

async function clearHistory() {
  if (!confirm("Clear translation history?")) return;
  await sendMessage({ type: MSG.CLEAR_HISTORY });
  refreshHistory();
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function codeToLabel(code) {
  const lang = LANGUAGE_LIST.find((l) => l.code === code || l.apiCode === code);
  return lang?.name || code;
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab));
  });
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}
