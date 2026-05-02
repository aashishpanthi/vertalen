/**
 * Two-layer translation cache.
 *
 *   1. In-memory LRU keyed by (text, src, tgt). Lives only as long as
 *      the service worker is alive.
 *   2. Persistent translation memory (TM) in chrome.storage.local.
 *      Survives across browser restarts and powers the export feature.
 *
 * The service worker reads the LRU first, then the TM, then makes a
 * network call. On success we write through to both layers.
 */

import { Storage } from "./storage.js";
import { makeTMKey } from "./api.js";

class LRU {
  constructor(capacity = 500) {
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  has(key) {
    return this.map.has(key);
  }

  size() {
    return this.map.size;
  }

  clear() {
    this.map.clear();
  }
}

const memoryCache = new LRU(750);

export const TranslationCache = {
  async get(text, src, tgt) {
    const key = makeTMKey(text.trim(), src, tgt);
    const memoHit = memoryCache.get(key);
    if (memoHit !== undefined) return memoHit;

    const settings = await Storage.getSettings();
    if (!settings.enableTranslationMemory) return undefined;

    const persisted = await Storage.getTMValue(key);
    if (persisted !== undefined) {
      memoryCache.set(key, persisted);
      return persisted;
    }
    return undefined;
  },

  async set(text, src, tgt, value) {
    const key = makeTMKey(text.trim(), src, tgt);
    memoryCache.set(key, value);
    const settings = await Storage.getSettings();
    if (settings.enableTranslationMemory) {
      await Storage.putTM(key, value);
    }
  },

  clearMemory() {
    memoryCache.clear();
  },

  async clearAll() {
    memoryCache.clear();
    await Storage.clearTM();
  },

  memorySize() {
    return memoryCache.size();
  },
};
