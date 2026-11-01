// Fixed-window failure counter (pure, in memory). Used to throttle sign-in
// attempts per IP address. Works for a single app instance; with several
// instances, move the counters to a shared store (e.g. Redis or the database).

export class FailureLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  /** Whether the key has reached the limit in the current window. */
  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry) return false;
    if (now - entry.windowStart >= this.windowMs) {
      this.hits.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) this.hits.set(key, { count: 1, windowStart: now });
    else entry.count++;
    // Keep memory bounded.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
    }
  }
}
