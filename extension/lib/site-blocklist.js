export const BUILTIN_BLOCKED_HOST_SUFFIXES = [
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

export function normalizeHost(hostname) {
  return String(hostname || "")
    .replace(/^www\./i, "")
    .toLowerCase()
    .trim();
}

const GOOGLE_HOST_RE = /^google\.[a-z0-9.]+$/i;

export function isGoogleSearchUrl(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    if (!GOOGLE_HOST_RE.test(normalizeHost(u.hostname))) return false;
    const path = u.pathname || "/";
    return path === "/search" || path.startsWith("/search?");
  } catch {
    return false;
  }
}

export function isBingSearchUrl(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    const h = normalizeHost(u.hostname);
    if (h !== "bing.com" && !h.endsWith(".bing.com")) return false;
    const path = u.pathname || "/";
    return path === "/search" || path.startsWith("/search?");
  } catch {
    return false;
  }
}

export function isYahooSearchUrl(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    const h = normalizeHost(u.hostname);
    if (h === "search.yahoo.com" || h.endsWith(".search.yahoo.com")) return true;
    if (h === "yahoo.com" || h.endsWith(".yahoo.com")) {
      const path = u.pathname || "/";
      return path.startsWith("/search");
    }
    return false;
  } catch {
    return false;
  }
}

export function isDuckDuckGoHost(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    const h = normalizeHost(u.hostname);
    return h === "duckduckgo.com" || h.endsWith(".duckduckgo.com");
  } catch {
    return false;
  }
}

function hostMatchesSuffix(hostname, suffix) {
  const h = normalizeHost(hostname);
  const s = normalizeHost(suffix);
  if (!s) return false;
  return h === s || h.endsWith(`.${s}`);
}

export function effectiveBlockedSuffixes(settings) {
  if (!settings?.translateBlocklistEnabled) return [];
  const raw = settings.translateBlockedHosts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...BUILTIN_BLOCKED_HOST_SUFFIXES];
  }
  return raw
    .map((s) => {
      const line = String(s).split("#")[0].trim();
      return normalizeHost(line);
    })
    .filter(Boolean);
}

export function isHostOnBlocklist(hostname, settings) {
  if (!settings?.translateBlocklistEnabled) return false;
  for (const suffix of effectiveBlockedSuffixes(settings)) {
    if (hostMatchesSuffix(hostname, suffix)) return true;
  }
  return false;
}

export function isUrlBlockedForVertalen(url, settings) {
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

export function isBotOrChallengeDocument(doc) {
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

export function shouldSkipImmersivePage(doc, loc, settings) {
  if (isBotOrChallengeDocument(doc)) return true;
  if (isUrlBlockedForVertalen(loc.href, settings)) return true;
  return false;
}
