/**
 * In-memory sliding-window rate limiter. One shared instance per process
 * is enough for the MVP: a single Fastify box handling the login path
 * doesn't need Redis, and failing closed (503) on counter loss during a
 * restart is acceptable because the user retries anyway.
 *
 * Policy lives at the call site (login = 5/min per IP+email, reset
 * request = 3/hour per email). This module only counts and expires.
 *
 * NOT suitable for distributed deployments or for enforcing a quota against
 * a determined attacker — pair with Fail2Ban at the edge for that.
 */
export interface RateLimit {
  /** Returns true when the hit is allowed; false when the window is full. */
  hit(key: string, now?: Date): boolean;
  /** Clears the counter for one key, e.g. after a successful login. */
  reset(key: string): void;
  /** Current count — exposed for tests only. */
  peek(key: string, now?: Date): number;
}

export interface RateLimitOptions {
  readonly max: number;
  readonly windowMs: number;
}

/**
 * Each key keeps the list of hit timestamps still inside the window. Old
 * entries fall off on the next hit (lazy GC) — cheaper than a periodic
 * sweep for a feature that most users don't touch.
 */
export function createRateLimit(opts: RateLimitOptions): RateLimit {
  const buckets = new Map<string, number[]>();

  const prune = (hits: number[], cutoff: number): number[] => {
    let start = 0;
    for (const h of hits) {
      if (h >= cutoff) break;
      start += 1;
    }
    return start === 0 ? hits : hits.slice(start);
  };

  return {
    hit(key, now = new Date()) {
      const t = now.getTime();
      const cutoff = t - opts.windowMs;
      const live = prune(buckets.get(key) ?? [], cutoff);
      if (live.length >= opts.max) {
        buckets.set(key, live);
        return false;
      }
      live.push(t);
      buckets.set(key, live);
      return true;
    },
    reset(key) {
      buckets.delete(key);
    },
    peek(key, now = new Date()) {
      const cutoff = now.getTime() - opts.windowMs;
      return prune(buckets.get(key) ?? [], cutoff).length;
    },
  };
}
