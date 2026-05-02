(() => {
  if (window.__vertalenInjected) return;
  window.__vertalenInjected = true;

  const BUILTIN_BLOCKED_HOST_SUFFIXES = [
    "facebook.com",
    "fb.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "licdn.com",
    "redd.it",
    "tiktok.com",
    "pinterest.com",
    "pinimg.com",
    "youtube.com",
    "youtu.be",
    "googlevideo.com",
    "snapchat.com",
    "discord.com",
    "discordapp.com",
    "discord.gg",
    "whatsapp.com",
    "web.whatsapp.com",
    "t.me",
    "telegram.org",
    "bsky.app",
    "tumblr.com",
    "challenges.cloudflare.com",
    "captcha.website",
  ];

  const GOOGLE_HOST_RE = /^google\.[a-z0-9.]+$/i;

  function normalizeHost(hostname) {
    return String(hostname || "")
      .replace(/^www\./i, "")
      .toLowerCase()
      .trim();
  }

  function isGoogleSearchUrl(u) {
    if (!GOOGLE_HOST_RE.test(normalizeHost(u.hostname))) return false;
    const path = u.pathname || "/";
    return path === "/search" || path.startsWith("/search?");
  }

  function isBingSearchUrl(u) {
    const h = normalizeHost(u.hostname);
    if (h !== "bing.com" && !h.endsWith(".bing.com")) return false;
    const path = u.pathname || "/";
    return path === "/search" || path.startsWith("/search?");
  }

  function isYahooSearchUrl(u) {
    const h = normalizeHost(u.hostname);
    if (h === "search.yahoo.com" || h.endsWith(".search.yahoo.com")) return true;
    if (h === "yahoo.com" || h.endsWith(".yahoo.com")) {
      const path = u.pathname || "/";
      return path.startsWith("/search");
    }
    return false;
  }

  function isDuckDuckGoHost(u) {
    const h = normalizeHost(u.hostname);
    return h === "duckduckgo.com" || h.endsWith(".duckduckgo.com");
  }

  function hostMatchesSuffix(hostname, suffix) {
    const h = normalizeHost(hostname);
    const s = normalizeHost(suffix);
    if (!s) return false;
    return h === s || h.endsWith(`.${s}`);
  }

  function effectiveBlockedSuffixes(settings) {
    if (!settings?.translateBlocklistEnabled) return [];
    const raw = settings.translateBlockedHosts;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [...BUILTIN_BLOCKED_HOST_SUFFIXES];
    }
    return raw
      .map((s) => normalizeHost(String(s).split("#")[0].trim()))
      .filter(Boolean);
  }

  function isHostOnBlocklist(hostname, settings) {
    if (!settings?.translateBlocklistEnabled) return false;
    for (const suffix of effectiveBlockedSuffixes(settings)) {
      if (hostMatchesSuffix(hostname, suffix)) return true;
    }
    return false;
  }

  function isUrlBlockedForVertalen(url, settings) {
    if (!url || !settings?.translateBlocklistEnabled) return false;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      if (isGoogleSearchUrl(u)) return true;
      if (isBingSearchUrl(u)) return true;
      if (isYahooSearchUrl(u)) return true;
      if (isDuckDuckGoHost(u)) return true;
      if (isHostOnBlocklist(u.hostname, settings)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function isBotOrChallengeDocument(doc) {
    if (!doc || !doc.documentElement) return false;
    const title = (doc.title || "").toLowerCase();
    if (
      /just a moment|attention required|checking your browser|verifying you are human|enable javascript and cookies|one more step|ddos-guard|ddos protection|security check|ray id/i.test(
        title,
      )
    ) {
      return true;
    }
    if (
      doc.querySelector(
        "#cf-challenge-running, #challenge-stage, #challenge-form, .cf-browser-verification, .cf-im-under-attack, .RayID, .ray-id, iframe[src*='challenges.cloudflare.com'], iframe[src*='/cdn-cgi/challenge-platform/']",
      )
    ) {
      return true;
    }
    const html = doc.documentElement;
    if (
      html.classList.contains("no-js") &&
      (doc.body?.innerText || "").toLowerCase().includes("challenge")
    ) {
      return true;
    }
    return false;
  }

  function shouldSkipImmersivePage(doc, loc, settings) {
    if (isBotOrChallengeDocument(doc)) return true;
    if (isUrlBlockedForVertalen(loc.href, settings)) return true;
    return false;
  }

  const MSG = {
    TRANSLATE_TEXT: "vertalen/translate_text",
    PAGE_PROGRESS: "vertalen/page_progress",
    TRANSLATE_CURRENT_SELECTION: "vertalen/translate-current-selection",
    IMMERSION_BOOTSTRAP: "vertalen/immersion_bootstrap",
    IMMERSION_RECORD: "vertalen/immersion_record",
  };

  const IMMERSION_ATTR = "data-vertalen-imm";
  const IMMERSION_PROCESSED = "data-vertalen-imm-scanned";

  const CRITICAL_CSS = `
:host { all: initial; }
.vertalen-floating,
.vertalen-card,
.vertalen-progress,
.vertalen-imm-pop {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #1a1f2e;
  -webkit-font-smoothing: antialiased;
}
.vertalen-floating { display: inline-flex; }
.vertalen-fab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.7rem;
  margin: 0;
  border: none;
  border-radius: 10px;
  background: #dc143c;
  color: #ffffff;
  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  box-shadow: 0 12px 32px rgba(220, 20, 60, 0.28);
  transition: transform 0.12s ease, box-shadow 0.2s ease;
  white-space: nowrap;
}
.vertalen-fab:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 38px rgba(220, 20, 60, 0.4);
}
.vertalen-fab__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-weight: 700;
  font-size: 0.9rem;
}
.vertalen-card {
  width: clamp(240px, 28vw, 380px);
  max-width: calc(100vw - 24px);
  background: #ffffff !important;
  color: #1a1f2e !important;
  border-radius: 14px;
  border: 1px solid rgba(26, 31, 46, 0.12);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6) inset,
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 16px 40px rgba(220, 20, 60, 0.18);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto;
  opacity: 1 !important;
  backdrop-filter: none !important;
}
.vertalen-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: rgba(220, 20, 60, 0.1);
  border-bottom: 1px solid rgba(26, 31, 46, 0.08);
}
.vertalen-card__pair {
  font-size: 0.72rem;
  font-weight: 700;
  color: #dc143c;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vertalen-card__close {
  background: transparent;
  border: none;
  color: #4b5563;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  transition: background 0.15s ease;
}
.vertalen-card__close:hover {
  background: rgba(26, 31, 46, 0.08);
  color: #1a1f2e;
}
.vertalen-card__body {
  padding: 0.85rem 0.95rem;
  display: grid;
  gap: 0.7rem;
  background: #ffffff;
}
.vertalen-card__translated {
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #1a1f2e;
}
.vertalen-card--error .vertalen-card__translated {
  color: #b91c1c;
}
.vertalen-card__detail {
  font-size: 0.78rem;
  color: #4b5563;
}
.vertalen-card__detail summary {
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-weight: 600;
}
.vertalen-card__detail summary::-webkit-details-marker { display: none; }
.vertalen-card__original {
  margin-top: 0.45rem;
  padding: 0.55rem 0.65rem;
  background: rgba(220, 20, 60, 0.08);
  border-radius: 10px;
  font-size: 0.83rem;
  color: #1a1f2e;
  line-height: 1.5;
}
.vertalen-card__actions {
  display: flex;
  gap: 0.4rem;
  padding: 0.55rem 0.75rem;
  border-top: 1px solid rgba(26, 31, 46, 0.08);
  background: #ffffff;
}
.vertalen-card__actions button {
  flex: 1 1 auto;
  margin: 0;
  padding: 0.4rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(26, 31, 46, 0.12);
  background: #ffffff;
  color: #1a1f2e;
  cursor: pointer;
  font: 600 0.78rem/1 inherit;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.vertalen-card__actions button:hover {
  background: rgba(220, 20, 60, 0.08);
  color: #dc143c;
  border-color: #dc143c;
}
.vertalen-spinner {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  border: 2px solid rgba(220, 20, 60, 0.2);
  border-top-color: #dc143c;
  animation: vertalen-spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes vertalen-spin { to { transform: rotate(360deg); } }
.vertalen-progress {
  width: clamp(220px, 22vw, 320px);
  background: #ffffff !important;
  color: #1a1f2e !important;
  border: 1px solid rgba(26, 31, 46, 0.1);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(220, 20, 60, 0.18);
  padding: 0.7rem 0.8rem;
  display: grid;
  gap: 0.45rem;
  opacity: 1 !important;
}
.vertalen-progress__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.vertalen-progress__title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #dc143c;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vertalen-progress__cancel {
  background: transparent;
  border: 1px solid rgba(26, 31, 46, 0.12);
  color: #4b5563;
  border-radius: 8px;
  font: 600 0.75rem/1 inherit;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}
.vertalen-progress__cancel:hover {
  border-color: #b91c1c;
  color: #b91c1c;
}
.vertalen-progress__label {
  font-size: 0.85rem;
  color: #1a1f2e;
}
.vertalen-progress__track {
  height: 6px;
  background: rgba(26, 31, 46, 0.1);
  border-radius: 999px;
  overflow: hidden;
}
.vertalen-progress__bar {
  height: 100%;
  background: #dc143c;
  width: 0;
  transition: width 0.25s ease;
}
.vertalen-progress--done .vertalen-progress__bar {
  background: #10b981;
}
.vertalen-progress--error .vertalen-progress__bar {
  background: #b91c1c;
}
.vertalen-progress__actions {
  display: flex;
  gap: 0.4rem;
  padding-top: 0.25rem;
}
.vertalen-progress__actions[hidden] {
  display: none;
}
.vertalen-progress__actions button {
  flex: 1 1 auto;
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(26, 31, 46, 0.12);
  background: #ffffff;
  color: #1a1f2e;
  cursor: pointer;
  font: 600 0.75rem/1 inherit;
}
.vertalen-progress__restore {
  border-color: #003893 !important;
  background: #003893 !important;
  color: #ffffff !important;
}
.vertalen-progress__restore:hover {
  background: #002766 !important;
  border-color: #002766 !important;
}
.vertalen-progress__dismiss:hover {
  background: rgba(220, 20, 60, 0.08);
  color: #dc143c;
  border-color: #dc143c;
}
.vertalen-imm-pop {
  width: clamp(220px, min(24vw, 100vw - 24px), 320px);
  max-width: calc(100vw - 24px);
  margin: 0;
  background: #ffffff !important;
  color: #1a1f2e !important;
  border-radius: 14px;
  border: 1px solid rgba(26, 31, 46, 0.14);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6) inset,
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 16px 40px rgba(0, 56, 147, 0.18);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto;
  font-size: 15px;
  opacity: 1 !important;
}
.vertalen-imm-pop__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 56, 147, 0.12);
  border-bottom: 1px solid rgba(0, 56, 147, 0.2);
}
.vertalen-imm-pop__pair {
  font-size: 0.72rem;
  font-weight: 700;
  color: #003893;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.vertalen-imm-pop__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  margin: 0;
  border: 1px solid rgba(26, 31, 46, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #4b5563;
  font-size: 1.25rem;
  line-height: 1;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.vertalen-imm-pop__close:hover {
  background: #ffffff;
  color: #1a1f2e;
  border-color: rgba(0, 56, 147, 0.35);
}
.vertalen-imm-pop__body {
  padding: 0.85rem 0.9rem 0.5rem;
  background: linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%);
  display: grid;
  gap: 0.35rem;
}
.vertalen-imm-pop__primary {
  font-size: clamp(1.05rem, 2vw + 0.5rem, 1.2rem);
  font-weight: 700;
  color: #002766;
  line-height: 1.3;
  word-break: break-word;
}
.vertalen-imm-pop__english {
  font-size: 0.82rem;
  color: #4b5563;
  font-weight: 500;
}
.vertalen-imm-pop__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  background: #f3f4f9;
  border-top: 1px solid rgba(26, 31, 46, 0.1);
}
.vertalen-imm-pop__actions button {
  flex: 1 1 calc(50% - 0.25rem);
  min-width: 6.5rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease,
    transform 0.08s ease;
}
.vertalen-imm-pop__actions button:active {
  transform: scale(0.98);
}
.vertalen-imm-pop__know {
  border: 1px solid #dc143c;
  background: #dc143c;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(220, 20, 60, 0.3);
}
.vertalen-imm-pop__know:hover {
  background: #b91030;
  border-color: #b91030;
}
.vertalen-imm-pop__again {
  border: 1px solid rgba(0, 56, 147, 0.45);
  background: #ffffff;
  color: #003893;
}
.vertalen-imm-pop__again:hover {
  background: rgba(0, 56, 147, 0.08);
  border-color: #003893;
}
@media (prefers-color-scheme: dark) {
  .vertalen-imm-pop {
    background: #2a1218;
    color: #f5e6e8;
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 4px 12px rgba(0, 0, 0, 0.45),
      0 20px 48px rgba(0, 0, 0, 0.55);
  }
  .vertalen-imm-pop__head {
    background: rgba(106, 142, 255, 0.14);
    border-bottom-color: rgba(106, 142, 255, 0.28);
  }
  .vertalen-imm-pop__pair {
    color: #9ab0ff;
  }
  .vertalen-imm-pop__close {
    background: rgba(42, 18, 24, 0.9);
    border-color: rgba(255, 255, 255, 0.14);
    color: #d4c4c8;
  }
  .vertalen-imm-pop__close:hover {
    background: #3a1c28;
    color: #f5e6e8;
    border-color: rgba(154, 176, 255, 0.45);
  }
  .vertalen-imm-pop__body {
    background: linear-gradient(180deg, #2a1218 0%, #241018 100%);
  }
  .vertalen-imm-pop__primary {
    color: #c8d4ff;
  }
  .vertalen-imm-pop__english {
    color: #b09098;
  }
  .vertalen-imm-pop__actions {
    background: #1f0e14;
    border-top-color: rgba(255, 255, 255, 0.1);
  }
  .vertalen-imm-pop__know {
    background: #ff5c7a;
    border-color: #ff5c7a;
    color: #1a0810;
    box-shadow: 0 2px 10px rgba(255, 92, 122, 0.35);
  }
  .vertalen-imm-pop__know:hover {
    background: #ff7a92;
    border-color: #ff7a92;
    color: #1a0810;
  }
  .vertalen-imm-pop__again {
    background: rgba(42, 18, 24, 0.95);
    border-color: rgba(154, 176, 255, 0.45);
    color: #9ab0ff;
  }
  .vertalen-imm-pop__again:hover {
    background: rgba(106, 142, 255, 0.16);
    border-color: #9ab0ff;
  }
}
`;

  const state = {
    settings: null,
    button: null,
    tooltip: null,
    progress: null,
    lastSelection: null,
    pendingRequest: null,
    immersion: null,
    immersionPopover: null,
    immersionObserver: null,
  };

  const E = {
    button: null,
    tooltip: null,
    progress: null,
  };

  const BLOCKED_HINT =
    "This site is on vertalen's blocklist (search, social, or challenge pages). You can change the list in Settings → Blocked sites.";

  let immersionAfterLoadHooked = false;
  let extensionContextLost = false;

  function isExtensionContextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function markContextLost() {
    if (extensionContextLost) return;
    extensionContextLost = true;
    try {
      state.immersionObserver?.disconnect();
    } catch (_) {}
    try {
      teardownImmersion();
    } catch (_) {}
    try {
      hideButton();
      hideTooltip();
      hideImmersionPopover();
      hideProgress();
    } catch (_) {}
    try {
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("scroll", repositionEphemeral, true);
      window.removeEventListener("resize", repositionEphemeral);
    } catch (_) {}
  }

  function safeSendMessage(message, callback) {
    if (extensionContextLost || !isExtensionContextValid()) {
      markContextLost();
      if (typeof callback === "function") callback(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (/context invalidated/i.test(err.message || "")) markContextLost();
          if (typeof callback === "function") callback(null);
          return;
        }
        if (typeof callback === "function") callback(resp);
      });
    } catch (err) {
      if (/context invalidated/i.test(err?.message || "")) markContextLost();
      if (typeof callback === "function") callback(null);
    }
  }

  function scheduleImmersionWhenReady() {
    if (!state.settings?.immersionEnabled) {
      teardownImmersion();
      return;
    }
    const run = () => {
      if (document.readyState !== "complete") return;
      maybeStartImmersion();
    };
    if (document.readyState === "complete") {
      queueMicrotask(run);
      return;
    }
    if (!immersionAfterLoadHooked) {
      immersionAfterLoadHooked = true;
      window.addEventListener("load", () => run(), { once: true });
    }
  }

  bootstrap();

  async function bootstrap() {
    state.settings = await getSettings();
    if (extensionContextLost) return;
    try {
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    } catch (_) {
      markContextLost();
      return;
    }
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("scroll", repositionEphemeral, true);
    window.addEventListener("resize", repositionEphemeral);
    try {
      chrome.storage?.onChanged?.addListener((changes) => {
        if (extensionContextLost) return;
        if (changes.settings) {
          getSettings().then((s) => {
            state.settings = s;
            scheduleImmersionWhenReady();
          });
        }
      });
    } catch (_) {}
    scheduleImmersionWhenReady();
  }

  function getSettings() {
    return new Promise((resolve) => {
      safeSendMessage({ type: "vertalen/get_settings" }, (resp) => {
        resolve(resp?.settings || {});
      });
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
      if (isUrlBlockedForVertalen(location.href, state.settings || {})) {
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
      showProgress({
        translated: 0,
        total: 0,
        label: message.label || "Preparing translation…",
      });
    } else if (stage === "progress") {
      showProgress({
        translated: message.translated,
        total: message.total,
        label:
          message.label ||
          `Translating ${message.translated}/${message.total}`,
      });
    } else if (stage === "done") {
      showProgress({
        translated: message.translated,
        total: message.total,
        label:
          message.label ||
          `Done — ${message.translated} blocks translated.`,
        finished: true,
        showRestore: true,
      });
      setTimeout(hideProgress, 8000);
    } else if (stage === "error") {
      showProgress({
        translated: 0,
        total: 0,
        label: message.error || "Translation failed.",
        error: true,
      });
      setTimeout(hideProgress, 8000);
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
    if (isUrlBlockedForVertalen(location.href, settings)) {
      showTooltip(state.lastSelection?.rect || lastViewportCenter(), {
        original: text,
        translated: BLOCKED_HINT,
        error: true,
        srcLabel: "",
        tgtLabel: "",
      });
      return;
    }
    showTooltip(state.lastSelection?.rect || lastViewportCenter(), {
      original: text,
      translated: "",
      loading: true,
      srcLabel: "",
      tgtLabel: codeToLabel(tgtOverride || settings.defaultTgt || "nep"),
    });
    safeSendMessage(
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
    const sync = document.createElement("style");
    sync.textContent = CRITICAL_CSS;
    shadow.appendChild(sync);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/tooltip.css");
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

  async function maybeStartImmersion() {
    if (!state.settings) return;
    if (!state.settings.immersionEnabled) {
      teardownImmersion();
      return;
    }
    if (document.readyState !== "complete") return;
    if (shouldSkipImmersivePage(document, location, state.settings)) {
      teardownImmersion();
      return;
    }
    if (state.immersion?.running) return;
    const resp = await new Promise((resolve) => {
      safeSendMessage({ type: MSG.IMMERSION_BOOTSTRAP }, (r) => resolve(r));
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
      } catch (_) {}
    });
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((mutations) => {
        if (extensionContextLost) {
          observer.disconnect();
          return;
        }
        if (!state.immersion?.running) return;
        if (state.immersion.candidatesShown >= state.immersion.maxOnPage) return;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scanForImmersion(node);
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      state.immersionObserver = observer;
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
    safeSendMessage({
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
    safeSendMessage({
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
    const host = state.immersionPopover.host;
    const rect = el.getBoundingClientRect();
    host.style.display = "block";
    positionTo(host, rect, { offsetY: 8, preferCenterX: true });
    requestAnimationFrame(() => {
      positionTo(host, el.getBoundingClientRect(), {
        offsetY: 8,
        preferCenterX: true,
      });
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
        safeSendMessage({
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
        safeSendMessage({
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
        <span class="vertalen-progress__title">vertalen · translate page</span>
        <button class="vertalen-progress__cancel" type="button">Cancel</button>
      </div>
      <div class="vertalen-progress__label"></div>
      <div class="vertalen-progress__track"><div class="vertalen-progress__bar"></div></div>
      <div class="vertalen-progress__actions" hidden>
        <button class="vertalen-progress__restore" type="button">Restore original</button>
        <button class="vertalen-progress__dismiss" type="button">Dismiss</button>
      </div>
    `;
    shadow.appendChild(bar);
    host.style.left = "auto";
    host.style.right = "16px";
    host.style.top = "16px";

    bar.querySelector(".vertalen-progress__cancel").addEventListener("click", () => {
      safeSendMessage({ type: "vertalen/cancel_page" });
      hideProgress();
    });
    bar.querySelector(".vertalen-progress__dismiss").addEventListener("click", hideProgress);
    bar.querySelector(".vertalen-progress__restore").addEventListener("click", () => {
      restorePageTranslations();
      hideProgress();
    });

    function set({ translated = 0, total = 0, label = "", finished, error, showRestore }) {
      bar.querySelector(".vertalen-progress__label").textContent = label;
      const pct = total ? Math.min(100, Math.round((translated / total) * 100)) : finished ? 100 : 5;
      bar.querySelector(".vertalen-progress__bar").style.width = `${pct}%`;
      bar.classList.toggle("vertalen-progress--done", Boolean(finished));
      bar.classList.toggle("vertalen-progress--error", Boolean(error));
      const cancelBtn = bar.querySelector(".vertalen-progress__cancel");
      cancelBtn.style.display = finished || error ? "none" : "";
      const actions = bar.querySelector(".vertalen-progress__actions");
      actions.hidden = !(showRestore || error);
      bar.querySelector(".vertalen-progress__restore").style.display = showRestore
        ? ""
        : "none";
    }

    return { host, shadow, set };
  }

  function restorePageTranslations() {
    const nodes = document.querySelectorAll("[data-vertalen-node][data-vertalen-translated]");
    let restored = 0;
    for (const el of nodes) {
      const orig = el.getAttribute("data-vertalen-original");
      if (orig != null) {
        el.textContent = orig;
        el.removeAttribute("data-vertalen-translated");
        restored += 1;
      }
    }
    console.log(`[vertalen] Restored ${restored} blocks to original.`);
  }
})();
