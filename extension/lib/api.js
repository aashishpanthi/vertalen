import { getLanguage } from "./languages.js";

export const TMT_ENDPOINT = "https://tmt.ilprl.ku.edu.np/lang-translate";

export class TMTError extends Error {
  constructor(message, { status = 0, kind = "unknown", retryable = false } = {}) {
    super(message);
    this.name = "TMTError";
    this.status = status;
    this.kind = kind;
    this.retryable = retryable;
  }
}

function classifyHttpError(status, body) {
  if (status === 401) {
    return new TMTError("Invalid API key. Open vertalen options to update it.", {
      status,
      kind: "auth",
      retryable: false,
    });
  }
  if (status === 400) {
    return new TMTError(body?.message || "Invalid request.", {
      status,
      kind: "bad_request",
      retryable: false,
    });
  }
  if (status === 429) {
    return new TMTError("Too many requests. Slowing down.", {
      status,
      kind: "rate_limit",
      retryable: true,
    });
  }
  if (status >= 500) {
    return new TMTError("Translation service is busy. Retrying.", {
      status,
      kind: "server",
      retryable: true,
    });
  }
  return new TMTError(`Unexpected response (HTTP ${status}).`, {
    status,
    kind: "unknown",
    retryable: false,
  });
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function jitter(ms) {
  return ms + Math.random() * ms * 0.25;
}

export class TMTClient {
  constructor({ apiKey, fetchImpl, maxRetries = 3 } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl ? fetchImpl : (...args) => fetch(...args);
    this.maxRetries = maxRetries;
  }

  setApiKey(value) {
    this.apiKey = value;
  }

  hasApiKey() {
    return Boolean(this.apiKey);
  }

  async translate(text, srcCode, tgtCode, { signal } = {}) {
    if (!this.apiKey) {
      throw new TMTError("API key is not set.", { kind: "auth" });
    }
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return {
        input: text,
        output: "",
        srcLang: srcCode,
        tgtLang: tgtCode,
        skipped: true,
      };
    }

    const src = getLanguage(srcCode);
    const tgt = getLanguage(tgtCode);
    if (!src || !tgt) {
      throw new TMTError(`Unsupported language pair: ${srcCode} → ${tgtCode}.`, {
        kind: "bad_request",
      });
    }
    if (src.code === tgt.code) {
      throw new TMTError("Source and target languages must differ.", {
        kind: "bad_request",
      });
    }

    const body = JSON.stringify({
      text,
      src_lang: src.apiCode,
      tgt_lang: tgt.apiCode,
    });

    let attempt = 0;
    let lastErr;

    while (attempt <= this.maxRetries) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      try {
        const response = await this.fetch(TMT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body,
          signal,
        });

        if (!response.ok) {
          const errBody = await readJsonSafe(response);
          const err = classifyHttpError(response.status, errBody);
          if (!err.retryable || attempt === this.maxRetries) throw err;
          lastErr = err;
        } else {
          const data = await readJsonSafe(response);
          if (!data) {
            throw new TMTError("Malformed response from TMT API.", {
              kind: "unknown",
            });
          }
          if (data.message_type && data.message_type !== "SUCCESS") {
            throw new TMTError(data.message || "Translation failed.", {
              kind: "model",
              retryable: false,
            });
          }
          return {
            input: data.input ?? text,
            output: data.output ?? "",
            srcLang: data.src_lang ?? src.name,
            tgtLang: data.target_lang ?? tgt.name,
            timestamp: data.timestamp ?? new Date().toISOString(),
          };
        }
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        if (err instanceof TMTError && !err.retryable) throw err;
        lastErr = err instanceof TMTError ? err : new TMTError(err.message || String(err));
      }

      const backoff = jitter(500 * 2 ** attempt);
      await new Promise((res) => setTimeout(res, backoff));
      attempt += 1;
    }

    throw lastErr || new TMTError("Translation failed after retries.");
  }
}

export function makeTMKey(text, src, tgt) {
  return `${src}|${tgt}|${text}`;
}
