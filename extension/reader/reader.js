import { MSG } from "../lib/messages.js";
import { Storage } from "../lib/storage.js";
import { LANGUAGE_LIST } from "../lib/languages.js";
import { detect } from "../lib/lang-detect.js";

const els = {
  docTitle: document.getElementById("docTitle"),
  docUrl: document.getElementById("docUrl"),
  srcLang: document.getElementById("srcLang"),
  tgtLang: document.getElementById("tgtLang"),
  run: document.getElementById("run"),
  cancel: document.getElementById("cancel"),
  progress: document.getElementById("progress"),
  progressLabel: document.getElementById("progressLabel"),
  progressFill: document.getElementById("progressFill"),
  originalCol: document.getElementById("originalCol"),
  translatedCol: document.getElementById("translatedCol"),
  origLang: document.getElementById("origLang"),
  targetLang: document.getElementById("targetLang"),
};

const state = {
  doc: null,
  blocks: [],
  abort: null,
};

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("d");
  if (!raw) {
    els.docTitle.textContent = "No content provided";
    return;
  }
  try {
    state.doc = JSON.parse(decodeURIComponent(raw));
  } catch {
    els.docTitle.textContent = "Could not parse content.";
    return;
  }
  renderDocument(state.doc);
  await applyDefaults();
  bindEvents();
}

function renderDocument(doc) {
  els.docTitle.textContent = doc.title || "Untitled";
  document.title = `vertalen — ${doc.title || "reader"}`;
  if (doc.url) {
    els.docUrl.textContent = doc.url;
    els.docUrl.href = doc.url;
  }
  els.originalCol.innerHTML = "";
  els.translatedCol.innerHTML = "";
  state.blocks = (doc.blocks || []).map((b, i) => {
    const oEl = renderBlock(b);
    oEl.dataset.idx = String(i);
    els.originalCol.appendChild(oEl);
    const tEl = document.createElement(b.tag === "li" ? "li" : tagFor(b.tag));
    tEl.className = "pending";
    tEl.dataset.idx = String(i);
    tEl.textContent = "—";
    els.translatedCol.appendChild(tEl);
    return { src: b, original: oEl, translated: tEl };
  });
}

function tagFor(t) {
  if (["h1", "h2", "h3", "h4", "p", "blockquote"].includes(t)) return t;
  return "p";
}

function renderBlock(b) {
  const el = document.createElement(b.tag === "li" ? "li" : tagFor(b.tag));
  el.textContent = b.text;
  return el;
}

async function applyDefaults() {
  const settings = await sendMessage({ type: MSG.GET_SETTINGS });
  els.srcLang.value = settings?.settings?.defaultSrc || "eng";
  els.tgtLang.value = settings?.settings?.defaultTgt || "nep";
  if (state.doc?.blocks?.length) {
    const sample = state.doc.blocks
      .slice(0, 3)
      .map((b) => b.text)
      .join(" ");
    const detected = detect(sample, els.tgtLang.value === "tmg" ? "nep" : "tmg");
    if (detected) els.srcLang.value = detected;
  }
  guardPair();
  els.origLang.textContent = labelOf(els.srcLang.value);
  els.targetLang.textContent = labelOf(els.tgtLang.value);
}

function guardPair() {
  if (els.srcLang.value === els.tgtLang.value) {
    const opts = ["eng", "nep", "tmg"];
    els.tgtLang.value = opts.find((c) => c !== els.srcLang.value);
  }
}

function bindEvents() {
  els.run.addEventListener("click", run);
  els.cancel.addEventListener("click", cancel);
  els.srcLang.addEventListener("change", () => {
    guardPair();
    els.origLang.textContent = labelOf(els.srcLang.value);
  });
  els.tgtLang.addEventListener("change", () => {
    guardPair();
    els.targetLang.textContent = labelOf(els.tgtLang.value);
  });
}

async function run() {
  if (state.abort) state.abort.abort();
  state.abort = new AbortController();
  els.run.disabled = true;
  els.cancel.disabled = false;
  els.progress.hidden = false;
  els.progressFill.style.width = "5%";
  els.progressLabel.textContent = "Translating…";

  for (const b of state.blocks) {
    b.translated.classList.add("pending");
    b.translated.classList.remove("error");
    b.translated.textContent = "Translating…";
  }

  let done = 0;
  const total = state.blocks.length;
  await Promise.all(
    state.blocks.map(async (block) => {
      if (state.abort.signal.aborted) return;
      try {
        const resp = await sendMessage({
          type: MSG.TRANSLATE_TEXT,
          text: block.src.text,
          src: els.srcLang.value,
          tgt: els.tgtLang.value,
          source: "reader",
        });
        if (!resp?.ok) {
          block.translated.classList.remove("pending");
          block.translated.classList.add("error");
          block.translated.textContent = resp?.error || "Failed to translate.";
        } else {
          block.translated.classList.remove("pending");
          block.translated.textContent = resp.output || "—";
        }
      } catch (err) {
        block.translated.classList.remove("pending");
        block.translated.classList.add("error");
        block.translated.textContent = err?.message || "Failed";
      } finally {
        done += 1;
        const pct = Math.min(100, Math.round((done / total) * 100));
        els.progressFill.style.width = `${pct}%`;
        els.progressLabel.textContent = `${done} / ${total} blocks`;
      }
    }),
  );

  els.run.disabled = false;
  els.cancel.disabled = true;
  setTimeout(() => {
    els.progress.hidden = true;
  }, 1500);
}

function cancel() {
  if (state.abort) state.abort.abort();
  els.cancel.disabled = true;
  els.run.disabled = false;
  els.progressLabel.textContent = "Cancelled.";
}

function labelOf(code) {
  return LANGUAGE_LIST.find((l) => l.code === code)?.name || code;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}
