const PRIORITY = Object.freeze({
  INTERACTIVE: 0,
  PAGE: 1,
  BACKGROUND: 2,
});

export class RateLimitedQueue {
  constructor({
    requestsPerMinute = 55,
    concurrency = 4,
    minSpacingMs = 50,
  } = {}) {
    this.requestsPerMinute = requestsPerMinute;
    this.concurrency = concurrency;
    this.minSpacingMs = minSpacingMs;

    this.tokens = requestsPerMinute;
    this.lastRefillTs = Date.now();
    this.lastDispatchTs = 0;
    this.inFlight = 0;
    this.queues = [[], [], []];
    this._timer = null;
  }

  static get PRIORITY() {
    return PRIORITY;
  }

  configure({ requestsPerMinute, concurrency, minSpacingMs }) {
    if (typeof requestsPerMinute === "number" && requestsPerMinute > 0) {
      const ratio = requestsPerMinute / this.requestsPerMinute;
      this.tokens = Math.min(requestsPerMinute, this.tokens * ratio);
      this.requestsPerMinute = requestsPerMinute;
    }
    if (typeof concurrency === "number" && concurrency > 0) {
      this.concurrency = concurrency;
    }
    if (typeof minSpacingMs === "number" && minSpacingMs >= 0) {
      this.minSpacingMs = minSpacingMs;
    }
  }

  enqueue(task, { priority = PRIORITY.INTERACTIVE, signal } = {}) {
    return new Promise((resolve, reject) => {
      const lane = Math.min(Math.max(priority, 0), this.queues.length - 1);
      const item = { task, resolve, reject, signal, cancelled: false };

      if (signal) {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            item.cancelled = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }

      this.queues[lane].push(item);
      this._tick();
    });
  }

  size() {
    return this.queues.reduce((acc, q) => acc + q.length, 0);
  }

  drain() {
    for (const q of this.queues) {
      while (q.length) {
        const item = q.shift();
        item.cancelled = true;
        item.reject(new DOMException("Drained", "AbortError"));
      }
    }
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefillTs;
    if (elapsed <= 0) return;
    const tokensToAdd = (elapsed / 60000) * this.requestsPerMinute;
    this.tokens = Math.min(this.requestsPerMinute, this.tokens + tokensToAdd);
    this.lastRefillTs = now;
  }

  _nextItem() {
    for (const q of this.queues) {
      while (q.length && q[0].cancelled) q.shift();
      if (q.length) return q.shift();
    }
    return null;
  }

  _tick() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._dispatch();
    }, 0);
  }

  _scheduleNext(delay) {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._dispatch();
    }, Math.max(delay, 5));
  }

  _dispatch() {
    this._refill();
    while (this.inFlight < this.concurrency) {
      const now = Date.now();
      const sinceLast = now - this.lastDispatchTs;
      if (sinceLast < this.minSpacingMs) {
        this._scheduleNext(this.minSpacingMs - sinceLast);
        return;
      }
      if (this.tokens < 1) {
        const msPerToken = 60000 / this.requestsPerMinute;
        this._scheduleNext(msPerToken);
        return;
      }
      const item = this._nextItem();
      if (!item) return;

      this.tokens -= 1;
      this.lastDispatchTs = now;
      this.inFlight += 1;

      Promise.resolve()
        .then(() => item.task())
        .then(
          (value) => {
            this.inFlight -= 1;
            if (!item.cancelled) item.resolve(value);
            this._tick();
          },
          (err) => {
            this.inFlight -= 1;
            if (!item.cancelled) item.reject(err);
            this._tick();
          },
        );
    }
  }
}
