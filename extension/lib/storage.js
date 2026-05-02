import { BUILTIN_BLOCKED_HOST_SUFFIXES } from "./site-blocklist.js";

const KEY = Object.freeze({
  API_KEY: "apiKey",
  SETTINGS: "settings",
  HISTORY: "history",
  TM: "translationMemory",
  ONBOARDED: "onboarded",
  IMMERSION: "immersionState",
  READER_DRAFT: "readerDraft",
});

const DEFAULT_SETTINGS = Object.freeze({
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
  translateBlockedHosts: [...BUILTIN_BLOCKED_HOST_SUFFIXES],
});

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function get(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(result?.[key]);
    });
  });
}

function set(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve();
    });
  });
}

function remove(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve();
    });
  });
}

export const Storage = {
  KEY,
  DEFAULT_SETTINGS,

  async getApiKey() {
    return (await get(KEY.API_KEY)) || "";
  },

  async setApiKey(value) {
    const trimmed = String(value || "").trim();
    if (trimmed.length === 0) {
      await remove(KEY.API_KEY);
      return "";
    }
    await set({ [KEY.API_KEY]: trimmed });
    return trimmed;
  },

  async clearApiKey() {
    await remove(KEY.API_KEY);
  },

  async getSettings() {
    const stored = (await get(KEY.SETTINGS)) || {};
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  async patchSettings(patch) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await set({ [KEY.SETTINGS]: next });
    return next;
  },

  async getHistory() {
    return (await get(KEY.HISTORY)) || [];
  },

  async pushHistory(entry) {
    const settings = await this.getSettings();
    const history = await this.getHistory();
    const next = [entry, ...history].slice(0, settings.maxHistory);
    await set({ [KEY.HISTORY]: next });
    return next;
  },

  async clearHistory() {
    await set({ [KEY.HISTORY]: [] });
  },

  async getTM() {
    return (await get(KEY.TM)) || {};
  },

  async putTM(key, value) {
    const tm = await this.getTM();
    tm[key] = { value, ts: Date.now() };
    await set({ [KEY.TM]: tm });
  },

  async getTMValue(key) {
    const tm = await this.getTM();
    return tm[key]?.value;
  },

  async clearTM() {
    await set({ [KEY.TM]: {} });
  },

  async isOnboarded() {
    return Boolean(await get(KEY.ONBOARDED));
  },

  async markOnboarded() {
    await set({ [KEY.ONBOARDED]: true });
  },

  async getImmersionState() {
    return (await get(KEY.IMMERSION)) || null;
  },

  async setImmersionState(state) {
    await set({ [KEY.IMMERSION]: state });
    return state;
  },

  async clearImmersionState() {
    await set({ [KEY.IMMERSION]: null });
  },

  async putReaderDraft(id, doc) {
    const all = (await get(KEY.READER_DRAFT)) || {};
    all[id] = { doc, ts: Date.now() };
    const cutoff = Date.now() - 1000 * 60 * 30;
    for (const k of Object.keys(all)) {
      if ((all[k]?.ts || 0) < cutoff) delete all[k];
    }
    await set({ [KEY.READER_DRAFT]: all });
  },

  async takeReaderDraft(id) {
    const all = (await get(KEY.READER_DRAFT)) || {};
    const entry = all[id];
    if (!entry) return null;
    delete all[id];
    await set({ [KEY.READER_DRAFT]: all });
    return entry.doc || null;
  },
};
