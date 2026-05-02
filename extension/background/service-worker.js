import { TMTClient, TMTError, makeTMKey } from "../lib/api.js";
import { Storage } from "../lib/storage.js";
import { TranslationCache } from "../lib/cache.js";
import { RateLimitedQueue } from "../lib/queue.js";
import { planTranslation, joinSentences } from "../lib/sentence-splitter.js";
import { detect, pickTarget } from "../lib/lang-detect.js";
import { getLanguage, isPairSupported } from "../lib/languages.js";
import { MSG } from "../lib/messages.js";
import { loadVocab } from "../lib/vocab-loader.js";
import {
  emptyState as emptySrsState,
  record as srsRecord,
  summary as srsSummary,
  pickCandidates as pickImmersionCandidates,
  buildQuizRound,
} from "../lib/srs.js";
import { isUrlBlockedForVertalen } from "../lib/site-blocklist.js";

const client = new TMTClient({});

const BLOCKED_SITE =
  "This site is blocked for translation (search, social, or your blocklist). Change it in vertalen Settings → Blocked sites.";
const queue = new RateLimitedQueue({ requestsPerMinute: 55, concurrency: 4 });
const activeJobs = new Map();

async function refreshClient() {
  const apiKey = await Storage.getApiKey();
  client.setApiKey(apiKey);
  const settings = await Storage.getSettings();
  queue.configure({ requestsPerMinute: settings.rateLimitPerMinute });
}

async function translateSentence(text, src, tgt, { signal, priority } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return { input: text, output: "", cached: false };

  const cached = await TranslationCache.get(text, src, tgt);
  if (cached) {
    return { input: text, output: cached, cached: true };
  }

  if (!client.hasApiKey()) await refreshClient();

  const result = await queue.enqueue(
    () => client.translate(text, src, tgt, { signal }),
    { priority, signal },
  );

  if (result.output) {
    await TranslationCache.set(text, src, tgt, result.output);
  }

  return { input: text, output: result.output, cached: false };
}

async function translateText(text, src, tgt, { signal, onChunk, priority } = {}) {
  const plan = planTranslation(text);
  const outputs = new Array(plan.unique.length).fill(null);

  if (plan.unique.length === 0) {
    return { translated: text, sentences: [], glue: plan.glue, cachedHits: 0 };
  }

  let completed = 0;
  let cachedHits = 0;
  await Promise.all(
    plan.unique.map(async (sentence, idx) => {
      try {
        const res = await translateSentence(sentence, src, tgt, {
          signal,
          priority,
        });
        outputs[idx] = res.output || sentence;
        if (res.cached) cachedHits += 1;
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        outputs[idx] = sentence;
      } finally {
        completed += 1;
        if (onChunk) {
          onChunk({
            completed,
            total: plan.unique.length,
            sentenceIndex: idx,
            output: outputs[idx],
          });
        }
      }
    }),
  );

  const orderedSentences = plan.indexes.map((i, sIdx) => {
    if (i === -1) return plan.sentences[sIdx];
    return outputs[i];
  });
  const translated = joinSentences(orderedSentences, plan.glue);

  return { translated, sentences: orderedSentences, glue: plan.glue, cachedHits };
}

async function recordHistory({ input, output, src, tgt, source }) {
  if (!output) return;
  await Storage.pushHistory({
    input,
    output,
    src,
    tgt,
    source,
    ts: Date.now(),
  });
}

async function buildContextMenus() {
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  const settings = await Storage.getSettings();
  const targets = [
    { code: "eng", label: "English" },
    { code: "nep", label: "Nepali" },
    { code: "tmg", label: "Tamang" },
  ];
  chrome.contextMenus.create({
    id: "vertalen.root",
    title: "vertalen: translate selection",
    contexts: ["selection"],
  });
  for (const t of targets) {
    if (t.code === settings.defaultSrc) continue;
    chrome.contextMenus.create({
      id: `vertalen.translate.${t.code}`,
      parentId: "vertalen.root",
      title: `Translate to ${t.label}`,
      contexts: ["selection"],
    });
  }
  chrome.contextMenus.create({
    id: "vertalen.sep",
    parentId: "vertalen.root",
    type: "separator",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "vertalen.openReader",
    parentId: "vertalen.root",
    title: "Open page in side-by-side reader",
    contexts: ["selection", "page"],
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await refreshClient();
  await buildContextMenus();
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html") });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshClient();
  await buildContextMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.apiKey || changes.settings) {
    refreshClient();
  }
  if (changes.settings) {
    buildContextMenus();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const settings = await Storage.getSettings();

  if (info.menuItemId === "vertalen.openReader") {
    openReader(tab.id);
    return;
  }

  const matches = String(info.menuItemId).match(/^vertalen\.translate\.(\w+)$/);
  if (!matches) return;
  const tgt = matches[1];
  const text = info.selectionText || "";
  if (!text.trim()) return;

  if (tab.url && isUrlBlockedForVertalen(tab.url, settings)) {
    notifyError(new TMTError(BLOCKED_SITE, { kind: "blocked", retryable: false }));
    return;
  }

  const src = settings.autoDetectSrc
    ? detect(text, settings.defaultSrc === "tmg" ? "tmg" : "nep") || settings.defaultSrc
    : settings.defaultSrc;
  const finalTgt = src === tgt ? pickTarget(src, settings.defaultTgt) : tgt;

  try {
    const { translated } = await translateText(text, src, finalTgt, {
      priority: RateLimitedQueue.PRIORITY.INTERACTIVE,
    });
    await recordHistory({
      input: text,
      output: translated,
      src,
      tgt: finalTgt,
      source: "context-menu",
    });
    chrome.tabs.sendMessage(tab.id, {
      type: MSG.TRANSLATE_TEXT,
      result: { input: text, output: translated, src, tgt: finalTgt },
    }).catch(() => {});
  } catch (err) {
    notifyError(err);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, { type: "vertalen/translate-current-selection" }).catch(() => {});
  } else if (command === "translate-page") {
    runPageTranslate(tab.id);
  } else if (command === "swap-languages") {
    const settings = await Storage.getSettings();
    await Storage.patchSettings({
      defaultSrc: settings.defaultTgt,
      defaultTgt: settings.defaultSrc,
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case MSG.PING:
          sendResponse({ ok: true });
          return;

        case MSG.GET_API_STATUS: {
          const apiKey = await Storage.getApiKey();
          sendResponse({
            ok: true,
            hasKey: Boolean(apiKey),
            keyMasked: apiKey ? maskKey(apiKey) : "",
          });
          return;
        }

        case MSG.GET_SETTINGS: {
          const settings = await Storage.getSettings();
          sendResponse({ ok: true, settings });
          return;
        }

        case MSG.SET_SETTINGS: {
          const next = await Storage.patchSettings(message.patch || {});
          sendResponse({ ok: true, settings: next });
          return;
        }

        case MSG.GET_HISTORY: {
          const history = await Storage.getHistory();
          sendResponse({ ok: true, history });
          return;
        }

        case MSG.CLEAR_HISTORY: {
          await Storage.clearHistory();
          sendResponse({ ok: true });
          return;
        }

        case MSG.EXPORT_TM: {
          const tm = await Storage.getTM();
          sendResponse({ ok: true, tm });
          return;
        }

        case MSG.TRANSLATE_TEXT: {
          const { text, src: rawSrc, tgt, source } = message;
          if (!text) {
            sendResponse({ ok: false, error: "No text provided." });
            return;
          }
          const settings = await Storage.getSettings();
          const src = rawSrc
            ? rawSrc
            : settings.autoDetectSrc
              ? detect(text, settings.defaultSrc === "tmg" ? "tmg" : "nep") ||
                settings.defaultSrc
              : settings.defaultSrc;
          const finalTgt = tgt && src !== tgt ? tgt : pickTarget(src, settings.defaultTgt);
          if (!isPairSupported(src, finalTgt)) {
            sendResponse({
              ok: false,
              error: `Unsupported language pair: ${src} → ${finalTgt}.`,
            });
            return;
          }
          const { translated } = await translateText(text, src, finalTgt, {
            priority: RateLimitedQueue.PRIORITY.INTERACTIVE,
          });
          await recordHistory({
            input: text,
            output: translated,
            src,
            tgt: finalTgt,
            source: source || "selection",
          });
          sendResponse({ ok: true, output: translated, src, tgt: finalTgt });
          return;
        }

        case MSG.TRANSLATE_BATCH: {
          const { items, src, tgt } = message;
          if (!Array.isArray(items) || !items.length) {
            sendResponse({ ok: true, results: [] });
            return;
          }
          const results = await Promise.all(
            items.map(async (text) => {
              try {
                const r = await translateSentence(text, src, tgt, {
                  priority: RateLimitedQueue.PRIORITY.PAGE,
                });
                return { ok: true, output: r.output };
              } catch (err) {
                return { ok: false, error: err.message };
              }
            }),
          );
          sendResponse({ ok: true, results });
          return;
        }

        case MSG.TRANSLATE_PAGE: {
          const { tabId, src, tgt } = message;
          const targetTab = tabId || sender.tab?.id;
          if (!targetTab) {
            sendResponse({ ok: false, error: "No tab provided." });
            return;
          }
          runPageTranslate(targetTab, { src, tgt });
          sendResponse({ ok: true });
          return;
        }

        case MSG.CANCEL_PAGE: {
          const { tabId } = message;
          const targetTab = tabId || sender.tab?.id;
          const job = activeJobs.get(targetTab);
          if (job) job.abort.abort();
          sendResponse({ ok: true });
          return;
        }

        case MSG.OPEN_READER: {
          const tabId = message.tabId || sender.tab?.id;
          if (tabId) openReader(tabId);
          sendResponse({ ok: true });
          return;
        }

        case MSG.IMMERSION_BOOTSTRAP: {
          const settings = await Storage.getSettings();
          if (!settings.immersionEnabled) {
            sendResponse({ ok: true, enabled: false });
            return;
          }
          const target = settings.immersionTarget || "tmg";
          const vocab = (await loadVocab()).filter(
            (e) =>
              e[target] && e.level <= (settings.immersionMaxLevel || 1) + 1,
          );
          const state = (await Storage.getImmersionState()) || emptySrsState();
          const candidates = pickImmersionCandidates(state, vocab, { limit: 120 });
          sendResponse({
            ok: true,
            enabled: true,
            target,
            density: settings.immersionDensity || 3,
            entries: candidates.map((e) => ({
              en: e.en,
              translation: e[target],
              category: e.category,
              level: e.level,
            })),
          });
          return;
        }

        case MSG.IMMERSION_RECORD: {
          const { word, action } = message;
          if (!word || !action) {
            sendResponse({ ok: false, error: "Missing word/action." });
            return;
          }
          const state = (await Storage.getImmersionState()) || emptySrsState();
          srsRecord(state, String(word).toLowerCase(), action);
          await Storage.setImmersionState(state);
          sendResponse({ ok: true, summary: srsSummary(state) });
          return;
        }

        case MSG.IMMERSION_STATS: {
          const state = (await Storage.getImmersionState()) || emptySrsState();
          sendResponse({ ok: true, summary: srsSummary(state) });
          return;
        }

        case MSG.IMMERSION_RESET: {
          await Storage.clearImmersionState();
          sendResponse({ ok: true });
          return;
        }

        case MSG.LEARN_QUIZ_DRAW: {
          const settings = await Storage.getSettings();
          const target = message.target || settings.immersionTarget || "tmg";
          const vocab = (await loadVocab()).filter((e) => e[target]);
          const state = (await Storage.getImmersionState()) || emptySrsState();
          const round = buildQuizRound(state, vocab, target);
          if (!round) {
            sendResponse({
              ok: false,
              error:
                "Browse with immersion mode on for a bit so you have words to quiz on.",
            });
            return;
          }
          sendResponse({ ok: true, round });
          return;
        }

        case MSG.LEARN_QUIZ_ANSWER: {
          const { word, correct } = message;
          if (!word) {
            sendResponse({ ok: false, error: "Missing word." });
            return;
          }
          const state = (await Storage.getImmersionState()) || emptySrsState();
          srsRecord(state, String(word).toLowerCase(), correct ? "correct" : "again");
          await Storage.setImmersionState(state);
          sendResponse({ ok: true, summary: srsSummary(state) });
          return;
        }

        default:
          sendResponse({ ok: false, error: "Unknown message type." });
      }
    } catch (err) {
      console.error("[vertalen]", err);
      sendResponse({
        ok: false,
        error: err?.message || String(err),
        kind: err instanceof TMTError ? err.kind : "unknown",
      });
    }
  })();

  return true;
});

async function runPageTranslate(tabId, { src, tgt } = {}) {
  const sendProgress = (payload) =>
    chrome.tabs.sendMessage(tabId, { type: MSG.PAGE_PROGRESS, ...payload }).catch(() => {});

  if (activeJobs.has(tabId)) {
    activeJobs.get(tabId).abort.abort();
  }

  const apiKey = await Storage.getApiKey();
  if (!apiKey) {
    const msg = "Add your TMT API token in vertalen settings to translate pages.";
    notifyError(new TMTError(msg, { kind: "auth" }));
    sendProgress({ stage: "error", error: msg });
    return;
  }

  const settings = await Storage.getSettings();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url && isUrlBlockedForVertalen(tab.url, settings)) {
    notifyError(new TMTError(BLOCKED_SITE, { kind: "blocked", retryable: false }));
    sendProgress({ stage: "error", error: BLOCKED_SITE });
    return;
  }

  const finalSrc = src || settings.defaultSrc;
  const finalTgt = tgt || settings.defaultTgt;
  if (!isPairSupported(finalSrc, finalTgt)) {
    const msg = `Unsupported pair: ${finalSrc} → ${finalTgt}. Pick different languages.`;
    notifyError(new TMTError(msg));
    sendProgress({ stage: "error", error: msg });
    return;
  }

  const abort = new AbortController();
  activeJobs.set(tabId, { abort });

  try {
    sendProgress({ stage: "starting", src: finalSrc, tgt: finalTgt });

    let nodes;
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: collectTextNodes,
      });
      nodes = result;
    } catch (err) {
      const msg = `Can't read this page (${err?.message || err}).`;
      notifyError(new TMTError(msg));
      sendProgress({ stage: "error", error: msg });
      return;
    }

    if (!Array.isArray(nodes) || !nodes.length) {
      sendProgress({
        stage: "error",
        error: "No translatable text found on this page.",
      });
      return;
    }

    const total = nodes.length;
    let translated = 0;
    let failed = 0;
    let firstError = null;

    await Promise.all(
      nodes.map(async (node) => {
        if (abort.signal.aborted) return;
        try {
          const { translated: outputText } = await translateText(
            node.text,
            finalSrc,
            finalTgt,
            {
              signal: abort.signal,
              priority: RateLimitedQueue.PRIORITY.PAGE,
            },
          );
          await chrome.scripting.executeScript({
            target: { tabId },
            func: applyTranslatedNode,
            args: [node.id, outputText],
          });
        } catch (err) {
          if (err?.name === "AbortError") return;
          failed += 1;
          if (!firstError) firstError = err;
          console.error("[vertalen] page translate node failed:", err);
        } finally {
          translated += 1;
          sendProgress({ stage: "progress", translated, total });
        }
      }),
    );

    if (failed > 0 && translated === failed) {
      const msg =
        firstError?.message || "Translation failed. Check your API token in settings.";
      notifyError(new TMTError(msg));
      sendProgress({ stage: "error", error: msg });
      return;
    }

    sendProgress({
      stage: "done",
      translated: total - failed,
      total,
      failed,
    });
  } catch (err) {
    notifyError(err);
    sendProgress({
      stage: "error",
      error: err?.message || String(err),
    });
  } finally {
    activeJobs.delete(tabId);
  }
}

async function openReader(tabId) {
  const settings = await Storage.getSettings();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url && isUrlBlockedForVertalen(tab.url, settings)) {
    notifyError(new TMTError(BLOCKED_SITE, { kind: "blocked", retryable: false }));
    return;
  }
  let result;
  try {
    [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractReadableContent,
    });
  } catch (err) {
    notifyError(new TMTError(`Reader can't run on this page: ${err?.message || err}`));
    return;
  }
  if (!result || !Array.isArray(result.blocks) || result.blocks.length === 0) {
    notifyError(
      new TMTError(
        "vertalen could not find readable text on this page. Try Translate this page instead.",
      ),
    );
    return;
  }
  const id = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await Storage.putReaderDraft(id, result);
  const url = chrome.runtime.getURL(`reader/reader.html?id=${id}`);
  chrome.tabs.create({ url });
}

function notifyError(err) {
  if (!err) return;
  if (err.name === "AbortError") return;
  const message = err?.message || "Translation failed.";
  chrome.notifications?.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "vertalen",
    message,
  });
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

function collectTextNodes() {
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "SVG",
    "MATH",
    "VIDEO",
    "AUDIO",
    "CANVAS",
  ]);
  const NODE_ATTR = "data-vertalen-node";
  let counter = 0;
  const collected = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${NODE_ATTR}], .vertalen-imm, .vertalen-root`)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      if (parent.getAttribute && parent.getAttribute("translate") === "no") {
        return NodeFilter.FILTER_REJECT;
      }
      const trimmed = node.nodeValue.trim();
      if (trimmed.length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const id = `vt-${counter++}`;
    const span = document.createElement("span");
    span.setAttribute(NODE_ATTR, id);
    span.setAttribute("data-vertalen-original", node.nodeValue);
    span.textContent = node.nodeValue;
    node.parentNode.replaceChild(span, node);
    collected.push({ id, text: span.textContent });
  }
  return collected;
}

function applyTranslatedNode(id, translated) {
  const el = document.querySelector(`[data-vertalen-node="${id}"]`);
  if (!el) return;
  el.textContent = translated;
  el.setAttribute("data-vertalen-translated", "1");
  el.style.transition = "background-color 0.4s ease";
  el.style.backgroundColor = "rgba(220, 20, 60, 0.12)";
  setTimeout(() => {
    el.style.backgroundColor = "transparent";
  }, 800);
}

function extractReadableContent() {
  const TITLE = document.title;
  const URL = location.href;
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NAV",
    "FOOTER",
    "ASIDE",
    "FORM",
    "NOSCRIPT",
  ]);
  const main = document.querySelector("article, main, [role=main]") || document.body;
  const blocks = [];
  for (const el of main.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")) {
    if (el.closest("nav, footer, aside")) continue;
    if ([...el.children].some((c) => SKIP_TAGS.has(c.tagName))) continue;
    const text = el.innerText.trim();
    if (text.length < 4) continue;
    blocks.push({ tag: el.tagName.toLowerCase(), text });
  }
  return { title: TITLE, url: URL, blocks };
}
