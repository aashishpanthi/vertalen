/**
 * vertalen — content script
 *
 * Runs in the isolated world on every web page (except chrome://, about://,
 * and a few file types we exclude in the manifest). Responsibilities:
 *
 *   - Detect text selection and show a non-destructive floating button.
 *   - Render translation tooltips and the full-page progress badge.
 *   - Forward translation requests to the service worker.
 *   - Listen for shortcut-driven translation requests.
 *
 * IMPORTANT: This file is not loaded as a module (manifest constraint),
 * so we use an IIFE and avoid ES import/export here.
 */

(() => {
  if (window.__vertalenInjected) return;
  window.__vertalenInjected = true;

  const MSG = {
    TRANSLATE_TEXT: "vertalen/translate_text",
    PAGE_PROGRESS: "vertalen/page_progress",
    TRANSLATE_CURRENT_SELECTION: "vertalen/translate-current-selection",
    IMMERSION_BOOTSTRAP: "vertalen/immersion_bootstrap",
    IMMERSION_RECORD: "vertalen/immersion_record",
  };

  const IMMERSION_ATTR = "data-vertalen-imm";
  const IMMERSION_PROCESSED = "data-vertalen-imm-scanned";

  const state = {
    settings: null,
    button: null,
    tooltip: null,
    progress: null,
    lastSelection: null,
    pendingRequest: null,
    immersion: null,
    immersionPopover: null,
  };

  const E = {
    button: null,
    tooltip: null,
    progress: null,
  };

  bootstrap();

  async function bootstrap() {
    state.settings = await getSettings();
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("scroll", repositionEphemeral, true);
    window.addEventListener("resize", repositionEphemeral);
    chrome.storage?.onChanged?.addListener((changes) => {
      if (changes.settings) {
        getSettings().then((s) => {
          state.settings = s;
          maybeStartImmersion();
        });
      }
    });
    maybeStartImmersion();
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "vertalen/get_settings" },
        (resp) => {
          resolve(resp?.settings || {});
        },
      );
    });
  }

  function onMouseDown(e) {
    if (e.target.closest?.(".vertalen-root")) return;
    if (e.target?.classList?.contains?.("vertalen-imm")) return;
    hideButton();
    hideTooltip();
    hideImmersionPopover();
  }

  function onMouseUp(e) {
    if (!state.settings?.showFloatingButton) return;
    if (e.target.closest?.(".vertalen-root")) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text || text.length < 2) {
        hideButton();
        return;
      }
      const range = sel.getRangeAt(0);
      state.lastSelection = { text, rect: range.getBoundingClientRect() };
      showButton(state.lastSelection.rect);
    }, 0);
  }

  function onKeyUp(e) {
    if (e.key === "Escape") {
      hideTooltip();
      hideButton();
      cancelPendingRequest();
    }
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (!message) return;
    if (message.type === MSG.TRANSLATE_TEXT && message.result) {
      const r = message.result;
      const rect = state.lastSelection?.rect || lastViewportCenter();
      showTooltip(rect, {
        original: r.input,
        translated: r.output,
        srcLabel: codeToLabel(r.src),
        tgtLabel: codeToLabel(r.tgt),
      });
      sendResponse?.({ ok: true });
      return;
    }
    if (message.type === MSG.PAGE_PROGRESS) {
      handlePageProgress(message);
      sendResponse?.({ ok: true });
      return;
    }
    if (message.type === MSG.TRANSLATE_CURRENT_SELECTION) {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text) {
        translateSelection(text);
      }
      sendResponse?.({ ok: true });
      return;
    }
  }

  function showButton(rect) {
    if (!E.button) E.button = createButton();
    const el = E.button.host;
    el.style.display = "block";
    positionTo(el, rect, { offsetY: 6 });
  }

  function hideButton() {
    if (E.button) E.button.host.style.display = "none";
  }

  function showTooltip(rect, payload) {
    if (!E.tooltip) E.tooltip = createTooltip();
    E.tooltip.set(payload);
    E.tooltip.host.style.display = "block";
    positionTo(E.tooltip.host, rect, { offsetY: 12, preferCenterX: true });
  }

  function hideTooltip() {
    if (E.tooltip) E.tooltip.host.style.display = "none";
  }

  function showProgress(state2 = {}) {
    if (!E.progress) E.progress = createProgress();
    E.progress.set(state2);
    E.progress.host.style.display = "block";
  }

  function hideProgress() {
    if (E.progress) E.progress.host.style.display = "none";
  }

  function handlePageProgress(message) {
    const stage = message.stage;
    if (stage === "starting") {
      showProgress({ translated: 0, total: 0, label: "Preparing…" });
    } else if (stage === "progress") {
      showProgress({
        translated: message.translated,
        total: message.total,
        label: `Translating ${message.translated}/${message.total}`,
      });
    } else if (stage === "done") {
      showProgress({
        translated: message.translated,
        total: message.total,
        label: `Done — ${message.translated} blocks translated.`,
        finished: true,
      });
      setTimeout(hideProgress, 4000);
    } else if (stage === "error") {
      showProgress({
        translated: 0,
        total: 0,
        label: message.error || "Translation failed.",
        error: true,
      });
      setTimeout(hideProgress, 6000);
    }
  }

  function repositionEphemeral() {
    if (state.lastSelection?.rect && E.button?.host?.style.display === "block") {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        hideButton();
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      state.lastSelection.rect = rect;
      positionTo(E.button.host, rect, { offsetY: 6 });
    }
  }

  function positionTo(el, rect, { offsetY = 0, preferCenterX = false } = {}) {
    const padding = 8;
    const w = el.offsetWidth || 220;
    const h = el.offsetHeight || 60;
    let x = preferCenterX
      ? rect.left + rect.width / 2 - w / 2
      : rect.right - w;
    let y = rect.bottom + offsetY;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    x = Math.max(padding, Math.min(x, vw - w - padding));
    if (y + h > vh - padding) {
      y = rect.top - h - offsetY;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function lastViewportCenter() {
    return {
      left: window.innerWidth / 2 - 80,
      right: window.innerWidth / 2 + 80,
      top: 80,
      bottom: 100,
      width: 160,
      height: 20,
    };
  }

  function cancelPendingRequest() {
    if (state.pendingRequest) {
      try {
        state.pendingRequest.abort();
      } catch (_) {}
      state.pendingRequest = null;
    }
  }

  async function translateSelection(textOverride, tgtOverride) {
    const text = textOverride || state.lastSelection?.text;
    if (!text) return;
    const settings = state.settings || {};
    showTooltip(state.lastSelection?.rect || lastViewportCenter(), {
      original: text,
      translated: "",
      loading: true,
      srcLabel: "",
      tgtLabel: codeToLabel(tgtOverride || settings.defaultTgt || "nep"),
    });
    chrome.runtime.sendMessage(
      {
        type: MSG.TRANSLATE_TEXT,
        text,
        tgt: tgtOverride || settings.defaultTgt,
        source: "selection",
      },
      (resp) => {
        if (!resp || !resp.ok) {
          showTooltip(state.lastSelection?.rect || lastViewportCenter(), {
            original: text,
            translated: resp?.error || "Translation failed.",
            error: true,
            srcLabel: "",
            tgtLabel: "",
          });
          return;
        }
        showTooltip(state.lastSelection?.rect || lastViewportCenter(), {
          original: text,
          translated: resp.output,
          srcLabel: codeToLabel(resp.src),
          tgtLabel: codeToLabel(resp.tgt),
        });
      },
    );
  }

  function codeToLabel(code) {
    return (
      {
        eng: "English",
        en: "English",
        nep: "Nepali",
        ne: "Nepali",
        tmg: "Tamang",
      }[code] || code || ""
    );
  }

  function createShadowHost(className) {
    const host = document.createElement("div");
    host.className = `vertalen-root ${className}`;
    host.style.cssText =
      "all: initial; position: fixed; z-index: 2147483646; display: none;";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    return { host, shadow };
  }

  function injectShadowStyles(shadow) {
    const styleHref = chrome.runtime.getURL("content/tooltip.css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styleHref;
    shadow.appendChild(link);
  }

  function createButton() {
    const { host, shadow } = createShadowHost("vertalen-floating-host");
    injectShadowStyles(shadow);
    const wrap = document.createElement("div");
    wrap.className = "vertalen-floating";
    const button = document.createElement("button");
    button.className = "vertalen-fab";
    button.type = "button";
    button.title = "Translate selection (Alt+T)";
    button.innerHTML = `
      <span class="vertalen-fab__glyph" aria-hidden="true">अ</span>
      <span class="vertalen-fab__label">Translate</span>
    `;
    button.addEventListener("mousedown", (e) => e.stopPropagation());
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      translateSelection();
      hideButton();
    });
    wrap.appendChild(button);
    shadow.appendChild(wrap);
    return { host, shadow };
  }

  function createTooltip() {
    const { host, shadow } = createShadowHost("vertalen-tooltip-host");
    injectShadowStyles(shadow);
    const card = document.createElement("div");
    card.className = "vertalen-card";
    card.innerHTML = `
      <div class="vertalen-card__head">
        <span class="vertalen-card__pair"></span>
        <button class="vertalen-card__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="vertalen-card__body">
        <div class="vertalen-card__translated"></div>
        <details class="vertalen-card__detail">
          <summary>Show original</summary>
          <div class="vertalen-card__original"></div>
        </details>
      </div>
      <div class="vertalen-card__actions">
        <button class="vertalen-card__copy" type="button">Copy</button>
        <button class="vertalen-card__retry" type="button">Retry</button>
      </div>
    `;
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    card.querySelector(".vertalen-card__close").addEventListener("click", hideTooltip);
    card.querySelector(".vertalen-card__copy").addEventListener("click", () => {
      const text = card.querySelector(".vertalen-card__translated").textContent;
      if (text) navigator.clipboard?.writeText(text);
    });
    card.querySelector(".vertalen-card__retry").addEventListener("click", () => {
      const orig = card.dataset.original;
      if (orig) translateSelection(orig);
    });
    shadow.appendChild(card);

    function set({ original, translated, loading, error, srcLabel, tgtLabel }) {
      card.dataset.original = original || "";
      card.classList.toggle("vertalen-card--loading", Boolean(loading));
      card.classList.toggle("vertalen-card--error", Boolean(error));
      card.querySelector(".vertalen-card__pair").textContent =
        srcLabel && tgtLabel
          ? `${srcLabel} → ${tgtLabel}`
          : tgtLabel
            ? `→ ${tgtLabel}`
            : "vertalen";
      const target = card.querySelector(".vertalen-card__translated");
      if (loading) {
        target.innerHTML =
          '<span class="vertalen-spinner" aria-hidden="true"></span><span>Translating…</span>';
      } else {
        target.textContent = translated || "";
      }
      card.querySelector(".vertalen-card__original").textContent = original || "";
    }

    return { host, shadow, set };
  }

  // ───────────────────────── Immersion mode ─────────────────────────

  async function maybeStartImmersion() {
    if (!state.settings) return;
    if (!state.settings.immersionEnabled) {
      teardownImmersion();
      return;
    }
    if (state.immersion?.running) return;
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: MSG.IMMERSION_BOOTSTRAP }, (r) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(r);
      });
    });
    if (!resp?.ok || !resp.enabled || !Array.isArray(resp.entries)) return;
    if (resp.entries.length === 0) return;

    const lookup = new Map();
    for (const e of resp.entries) {
      if (e.en && e.translation) {
        lookup.set(e.en.toLowerCase(), e);
      }
    }
    state.immersion = {
      running: true,
      target: resp.target,
      density: resp.density,
      lookup,
      keysSorted: [...lookup.keys()].sort((a, b) => b.length - a.length),
      seen: new Set(),
      candidatesShown: 0,
      maxOnPage: 30,
    };
    runImmersion();
  }

  function teardownImmersion() {
    if (!state.immersion) return;
    state.immersion.running = false;
    document.querySelectorAll(`[${IMMERSION_ATTR}]`).forEach((el) => {
      const original = el.getAttribute("data-vertalen-imm-original");
      if (original) {
        el.replaceWith(document.createTextNode(original));
      } else {
        el.remove();
      }
    });
    state.immersion = null;
  }

  function runImmersion() {
    const start =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb) => setTimeout(cb, 200);
    start(() => {
      try {
        scanForImmersion(document.body);
      } catch (err) {
        // Fail quietly to avoid breaking the host page.
      }
    });
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((mutations) => {
        if (!state.immersion?.running) return;
        if (state.immersion.candidatesShown >= state.immersion.maxOnPage) return;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scanForImmersion(node);
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function scanForImmersion(root) {
    const imm = state.immersion;
    if (!imm || !imm.running) return;
    if (imm.candidatesShown >= imm.maxOnPage) return;

    const SKIP = new Set([
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
      "BUTTON",
      "SVG",
      "MATH",
      "VIDEO",
      "AUDIO",
      "CANVAS",
      "A",
    ]);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length < 4) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("a, [contenteditable=true]")) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-vertalen-translated], [data-vertalen-node]")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`[${IMMERSION_PROCESSED}]`)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".vertalen-root")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const candidates = [];
    while (walker.nextNode()) {
      candidates.push(walker.currentNode);
    }

    const density = imm.density / 100;
    const remaining = imm.maxOnPage - imm.candidatesShown;
    let replaced = 0;

    for (const node of candidates) {
      if (replaced >= remaining) break;
      if (!state.immersion?.running) break;
      const text = node.nodeValue;
      const matches = findMatches(text, imm.keysSorted);
      if (matches.length === 0) {
        node.parentElement?.setAttribute(IMMERSION_PROCESSED, "1");
        continue;
      }
      const wantedHere = Math.max(1, Math.round(matches.length * density));
      const picked = pickRandom(matches, Math.min(wantedHere, remaining - replaced));
      if (picked.length === 0) {
        node.parentElement?.setAttribute(IMMERSION_PROCESSED, "1");
        continue;
      }
      replaceMatchesInTextNode(node, picked);
      replaced += picked.length;
      imm.candidatesShown += picked.length;
    }
  }

  function findMatches(text, keysSorted) {
    const matches = [];
    const taken = new Array(text.length).fill(false);
    const lower = text.toLowerCase();
    for (const key of keysSorted) {
      if (key.length < 2) continue;
      let from = 0;
      while (from < lower.length) {
        const idx = lower.indexOf(key, from);
        if (idx === -1) break;
        const end = idx + key.length;
        const before = idx === 0 ? " " : text[idx - 1];
        const after = end >= text.length ? " " : text[end];
        const isWordBoundary =
          /\W/.test(before) && /\W/.test(after);
        if (isWordBoundary && !taken.slice(idx, end).some(Boolean)) {
          matches.push({ start: idx, end, key, surface: text.slice(idx, end) });
          for (let i = idx; i < end; i++) taken[i] = true;
          from = end;
        } else {
          from = idx + 1;
        }
      }
    }
    matches.sort((a, b) => a.start - b.start);
    return matches;
  }

  function pickRandom(arr, n) {
    if (arr.length <= n) return arr.slice();
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  function replaceMatchesInTextNode(node, matches) {
    const text = node.nodeValue;
    const parent = node.parentNode;
    if (!parent) return;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      }
      const span = createImmersionSpan(m.key, m.surface);
      frag.appendChild(span);
      cursor = m.end;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    parent.replaceChild(frag, node);
  }

  function createImmersionSpan(key, surface) {
    const entry = state.immersion?.lookup.get(key);
    const span = document.createElement("span");
    span.className = "vertalen-imm";
    span.setAttribute(IMMERSION_ATTR, "1");
    span.setAttribute("data-vertalen-imm-original", surface);
    span.setAttribute("data-vertalen-imm-key", key);
    span.setAttribute("title", `${surface} — click for options`);
    span.textContent = entry?.translation || surface;
    span.addEventListener("mouseenter", onImmersionHover);
    span.addEventListener("click", onImmersionClick);
    state.immersion.seen.add(key);
    chrome.runtime.sendMessage({
      type: MSG.IMMERSION_RECORD,
      word: key,
      action: "shown",
    });
    return span;
  }

  function onImmersionHover(e) {
    const el = e.currentTarget;
    const key = el.getAttribute("data-vertalen-imm-key");
    if (!key) return;
    chrome.runtime.sendMessage({
      type: MSG.IMMERSION_RECORD,
      word: key,
      action: "hovered",
    });
  }

  function onImmersionClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    showImmersionPopover(el);
  }

  function showImmersionPopover(el) {
    if (!state.immersionPopover) state.immersionPopover = createImmersionPopover();
    const original = el.getAttribute("data-vertalen-imm-original");
    const key = el.getAttribute("data-vertalen-imm-key");
    const translated = el.textContent;
    state.immersionPopover.set({ original, key, translated });
    state.immersionPopover.host.style.display = "block";
    positionTo(state.immersionPopover.host, el.getBoundingClientRect(), {
      offsetY: 8,
      preferCenterX: true,
    });
  }

  function hideImmersionPopover() {
    if (state.immersionPopover) state.immersionPopover.host.style.display = "none";
  }

  function createImmersionPopover() {
    const { host, shadow } = createShadowHost("vertalen-imm-pop-host");
    injectShadowStyles(shadow);
    const card = document.createElement("div");
    card.className = "vertalen-imm-pop";
    card.innerHTML = `
      <div class="vertalen-imm-pop__head">
        <span class="vertalen-imm-pop__pair">vertalen · learn</span>
        <button class="vertalen-imm-pop__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="vertalen-imm-pop__body">
        <div class="vertalen-imm-pop__primary"></div>
        <div class="vertalen-imm-pop__english"></div>
      </div>
      <div class="vertalen-imm-pop__actions">
        <button class="vertalen-imm-pop__know" type="button">I know this</button>
        <button class="vertalen-imm-pop__again" type="button">Show again</button>
      </div>
    `;
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    card.querySelector(".vertalen-imm-pop__close").addEventListener("click", hideImmersionPopover);

    card.querySelector(".vertalen-imm-pop__know").addEventListener("click", () => {
      const key = card.dataset.key;
      if (key) {
        chrome.runtime.sendMessage({
          type: MSG.IMMERSION_RECORD,
          word: key,
          action: "correct",
        });
      }
      hideImmersionPopover();
    });
    card.querySelector(".vertalen-imm-pop__again").addEventListener("click", () => {
      const key = card.dataset.key;
      if (key) {
        chrome.runtime.sendMessage({
          type: MSG.IMMERSION_RECORD,
          word: key,
          action: "again",
        });
      }
      hideImmersionPopover();
    });

    shadow.appendChild(card);

    function set({ original, key, translated }) {
      card.dataset.key = key || "";
      card.querySelector(".vertalen-imm-pop__primary").textContent = translated || "";
      card.querySelector(".vertalen-imm-pop__english").textContent = original
        ? `English: ${original}`
        : "";
    }

    return { host, shadow, set };
  }

  function createProgress() {
    const { host, shadow } = createShadowHost("vertalen-progress-host");
    injectShadowStyles(shadow);
    const bar = document.createElement("div");
    bar.className = "vertalen-progress";
    bar.innerHTML = `
      <div class="vertalen-progress__head">
        <span class="vertalen-progress__title">vertalen</span>
        <button class="vertalen-progress__cancel" type="button">Cancel</button>
      </div>
      <div class="vertalen-progress__label"></div>
      <div class="vertalen-progress__track"><div class="vertalen-progress__bar"></div></div>
    `;
    shadow.appendChild(bar);
    host.style.left = "auto";
    host.style.right = "16px";
    host.style.top = "16px";

    bar.querySelector(".vertalen-progress__cancel").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "vertalen/cancel_page" });
      hideProgress();
    });

    function set({ translated = 0, total = 0, label = "", finished, error }) {
      bar.querySelector(".vertalen-progress__label").textContent = label;
      const pct = total ? Math.min(100, Math.round((translated / total) * 100)) : finished ? 100 : 5;
      bar.querySelector(".vertalen-progress__bar").style.width = `${pct}%`;
      bar.classList.toggle("vertalen-progress--done", Boolean(finished));
      bar.classList.toggle("vertalen-progress--error", Boolean(error));
    }

    return { host, shadow, set };
  }
})();
