import { MSG } from "../lib/messages.js";
import { Storage, SETTINGS_KEYS } from "../lib/storage.js";
import { TMTClient } from "../lib/api.js";

const els = {
  apiKey: document.getElementById("apiKey"),
  toggleVisibility: document.getElementById("toggleVisibility"),
  saveKey: document.getElementById("saveKey"),
  testKey: document.getElementById("testKey"),
  clearKey: document.getElementById("clearKey"),
  testResult: document.getElementById("testResult"),
  apiForm: document.getElementById("apiForm"),

  defaultSrc: document.getElementById("defaultSrc"),
  defaultTgt: document.getElementById("defaultTgt"),

  autoDetectSrc: document.getElementById("autoDetectSrc"),
  showFloatingButton: document.getElementById("showFloatingButton"),
  inlineTooltip: document.getElementById("inlineTooltip"),
  fullPagePreserveOriginal: document.getElementById("fullPagePreserveOriginal"),

  rateLimitPerMinute: document.getElementById("rateLimitPerMinute"),
  rateValue: document.getElementById("rateValue"),
  enableTranslationMemory: document.getElementById("enableTranslationMemory"),

  immersionEnabled: document.getElementById("immersionEnabled"),
  immersionTarget: document.getElementById("immersionTarget"),
  immersionMaxLevel: document.getElementById("immersionMaxLevel"),
  immersionMaxLevelLabel: document.getElementById("immersionMaxLevelLabel"),
  immersionDensity: document.getElementById("immersionDensity"),
  immersionDensityLabel: document.getElementById("immersionDensityLabel"),
  immersionDailyGoal: document.getElementById("immersionDailyGoal"),
  immStatStreak: document.getElementById("immStatStreak"),
  immStatSeen: document.getElementById("immStatSeen"),
  immStatMastered: document.getElementById("immStatMastered"),
  immReset: document.getElementById("immReset"),

  tmCount: document.getElementById("tmCount"),
  tmSize: document.getElementById("tmSize"),
  exportTmJson: document.getElementById("exportTmJson"),
  exportTmCsv: document.getElementById("exportTmCsv"),
  clearTm: document.getElementById("clearTm"),

  historyCount: document.getElementById("historyCount"),
  maxHistory: document.getElementById("maxHistory"),
  exportHistory: document.getElementById("exportHistory"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),

  status: document.getElementById("status"),
  version: document.getElementById("version"),
};

init();

async function init() {
  els.version.textContent = chrome.runtime.getManifest().version;

  const [keyResp, settings, history, tm] = await Promise.all([
    sendMessage({ type: MSG.GET_API_STATUS }),
    sendMessage({ type: MSG.GET_SETTINGS }),
    sendMessage({ type: MSG.GET_HISTORY }),
    sendMessage({ type: MSG.EXPORT_TM }),
  ]);

  if (keyResp?.hasKey) {
    setStatus("Key configured", "ok");
    const stored = await Storage.getApiKey();
    els.apiKey.value = stored;
  }

  applySettings(settings?.settings || {});
  updateHistory(history?.history || []);
  updateTm(tm?.tm || {});
  bindEvents();
}

function applySettings(settings) {
  if (settings.defaultSrc) els.defaultSrc.value = settings.defaultSrc;
  if (settings.defaultTgt) els.defaultTgt.value = settings.defaultTgt;
  els.autoDetectSrc.checked = settings.autoDetectSrc !== false;
  els.showFloatingButton.checked = settings.showFloatingButton !== false;
  els.inlineTooltip.checked = settings.inlineTooltip !== false;
  els.fullPagePreserveOriginal.checked = settings.fullPagePreserveOriginal !== false;
  els.rateLimitPerMinute.value = settings.rateLimitPerMinute ?? 55;
  els.rateValue.textContent = String(settings.rateLimitPerMinute ?? 55);
  els.enableTranslationMemory.checked = settings.enableTranslationMemory !== false;
  els.maxHistory.value = settings.maxHistory ?? 50;

  els.immersionEnabled.checked = Boolean(settings.immersionEnabled);
  els.immersionTarget.value = settings.immersionTarget || "tmg";
  els.immersionMaxLevel.value = settings.immersionMaxLevel ?? 1;
  els.immersionMaxLevelLabel.textContent = String(settings.immersionMaxLevel ?? 1);
  els.immersionDensity.value = settings.immersionDensity ?? 3;
  els.immersionDensityLabel.textContent = `${settings.immersionDensity ?? 3}%`;
  els.immersionDailyGoal.value = settings.immersionDailyGoal ?? 5;
}

function bindEvents() {
  els.apiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = els.apiKey.value.trim();
    if (!value) {
      setTestResult("Paste a token first.", "err");
      return;
    }
    await Storage.setApiKey(value);
    setTestResult("Saved.", "ok");
    setStatus("Key configured", "ok");
  });

  els.testKey.addEventListener("click", async () => {
    const value = els.apiKey.value.trim();
    if (!value) {
      setTestResult("Paste a token first.", "err");
      return;
    }
    setTestResult("Testing…", "busy");
    try {
      const client = new TMTClient({ apiKey: value, maxRetries: 0 });
      const r = await client.translate("Hello", "eng", "nep");
      if (r.output) {
        setTestResult(`Connection OK — sample: "${r.output}"`, "ok");
      } else {
        setTestResult("Got an empty response.", "err");
      }
    } catch (err) {
      setTestResult(err?.message || "Connection failed.", "err");
    }
  });

  els.clearKey.addEventListener("click", async () => {
    if (!confirm("Remove the saved API key?")) return;
    await Storage.clearApiKey();
    els.apiKey.value = "";
    setTestResult("Key removed.", "ok");
    setStatus("No key configured", "err");
  });

  els.toggleVisibility.addEventListener("click", () => {
    const isPwd = els.apiKey.type === "password";
    els.apiKey.type = isPwd ? "text" : "password";
    els.toggleVisibility.textContent = isPwd ? "Hide" : "Show";
  });

  bindSettingChange(els.defaultSrc, (e) => ({ defaultSrc: e.target.value }));
  bindSettingChange(els.defaultTgt, (e) => ({ defaultTgt: e.target.value }));
  bindSettingChange(els.autoDetectSrc, (e) => ({ autoDetectSrc: e.target.checked }));
  bindSettingChange(els.showFloatingButton, (e) => ({ showFloatingButton: e.target.checked }));
  bindSettingChange(els.inlineTooltip, (e) => ({ inlineTooltip: e.target.checked }));
  bindSettingChange(els.fullPagePreserveOriginal, (e) => ({
    fullPagePreserveOriginal: e.target.checked,
  }));
  bindSettingChange(els.enableTranslationMemory, (e) => ({
    enableTranslationMemory: e.target.checked,
  }));
  bindSettingChange(els.rateLimitPerMinute, (e) => {
    const n = Number(e.target.value);
    els.rateValue.textContent = String(n);
    return { rateLimitPerMinute: n };
  });
  bindSettingChange(els.maxHistory, (e) => ({
    maxHistory: Math.max(0, Math.min(500, Number(e.target.value) || 50)),
  }));

  bindSettingChange(els.immersionEnabled, (e) => ({ immersionEnabled: e.target.checked }));
  bindSettingChange(els.immersionTarget, (e) => ({ immersionTarget: e.target.value }));
  bindSettingChange(els.immersionMaxLevel, (e) => {
    const n = Number(e.target.value);
    els.immersionMaxLevelLabel.textContent = String(n);
    return { immersionMaxLevel: n };
  });
  bindSettingChange(els.immersionDensity, (e) => {
    const n = Number(e.target.value);
    els.immersionDensityLabel.textContent = `${n}%`;
    return { immersionDensity: n };
  });
  bindSettingChange(els.immersionDailyGoal, (e) => ({
    immersionDailyGoal: Math.max(1, Math.min(50, Number(e.target.value) || 5)),
  }));

  els.immReset.addEventListener("click", async () => {
    if (!confirm("Reset all immersion progress (streak, seen words, mastered)?")) return;
    await sendMessage({ type: MSG.IMMERSION_RESET });
    refreshImmersionStats();
  });

  refreshImmersionStats();

  els.exportTmJson.addEventListener("click", () => exportTM("json"));
  els.exportTmCsv.addEventListener("click", () => exportTM("csv"));
  els.clearTm.addEventListener("click", async () => {
    if (!confirm("Clear all translation memory?")) return;
    await Storage.clearTM();
    updateTm({});
  });

  els.exportHistory.addEventListener("click", exportHistory);
  els.clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Clear translation history?")) return;
    await sendMessage({ type: MSG.CLEAR_HISTORY });
    updateHistory([]);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.translationMemory) {
      updateTm(changes.translationMemory.newValue || {});
    }
    if (changes.history) {
      updateHistory(changes.history.newValue || []);
    }
  });
}

function bindSettingChange(el, mapper) {
  el.addEventListener("change", async (e) => {
    const patch = mapper(e);
    await sendMessage({ type: MSG.SET_SETTINGS, patch });
  });
  if (el.type === "range") {
    el.addEventListener("input", (e) => {
      const patch = mapper(e);
      if (patch.rateLimitPerMinute) {
        els.rateValue.textContent = String(patch.rateLimitPerMinute);
      }
      if (patch.immersionMaxLevel != null) {
        els.immersionMaxLevelLabel.textContent = String(patch.immersionMaxLevel);
      }
      if (patch.immersionDensity != null) {
        els.immersionDensityLabel.textContent = `${patch.immersionDensity}%`;
      }
    });
  }
}

async function refreshImmersionStats() {
  const resp = await sendMessage({ type: MSG.IMMERSION_STATS });
  const s = resp?.summary || {};
  els.immStatStreak.textContent = String(s.streak || 0);
  els.immStatSeen.textContent = String(s.seen || 0);
  els.immStatMastered.textContent = String(s.mastered || 0);
}

function updateHistory(history) {
  els.historyCount.textContent = String(history.length);
}

function updateTm(tm) {
  const keys = Object.keys(tm);
  els.tmCount.textContent = String(keys.length);
  const sizeBytes = new Blob([JSON.stringify(tm)]).size;
  els.tmSize.textContent = humanBytes(sizeBytes);
}

function humanBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function exportTM(fmt) {
  const tm = await Storage.getTM();
  const entries = Object.entries(tm).map(([k, v]) => {
    const [src, tgt, ...rest] = k.split("|");
    const text = rest.join("|");
    return {
      src,
      tgt,
      input: text,
      output: v.value,
      timestamp: new Date(v.ts).toISOString(),
    };
  });

  let content, mime, filename;
  if (fmt === "json") {
    content = JSON.stringify(entries, null, 2);
    mime = "application/json";
    filename = `vertalen-memory-${Date.now()}.json`;
  } else {
    content = csvify(entries);
    mime = "text/csv";
    filename = `vertalen-memory-${Date.now()}.csv`;
  }
  download(filename, content, mime);
}

async function exportHistory() {
  const resp = await sendMessage({ type: MSG.GET_HISTORY });
  const content = JSON.stringify(resp?.history || [], null, 2);
  download(`vertalen-history-${Date.now()}.json`, content, "application/json");
}

function csvify(rows) {
  const cols = ["src", "tgt", "input", "output", "timestamp"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

function setStatus(text, kind = "ok") {
  els.status.textContent = text;
  els.status.style.color = kind === "ok" ? "var(--success)" : "var(--error)";
}

function setTestResult(text, state) {
  els.testResult.textContent = text;
  els.testResult.dataset.state = state;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}
