import { randomToken, sha256Hex, TOKEN_BYTES } from "./tokens.js";

/**
 * Session timing — kept configurable so tests can shrink them without
 * reaching into private module state. One source of truth for both the
 * creation side (what we write to the DB) and the validation side (what
 * expiry we read back).
 */
export const SESSION = {
  IDLE_MS: 30 * 60_000, // 30 minutes sliding
  ABSOLUTE_MS: 12 * 60 * 60_000, // 12 hours hard cap
  COOKIE_NAME: "orbita_sid",
} as const;

export interface NewSession {
  readonly token: string;
  readonly tokenHash: string;
  readonly csrfToken: string;
  readonly idleExpires: Date;
  readonly absExpires: Date;
}

/**
 * Make a fresh session's fields: a raw token for the cookie, the stored hash
 * for the DB, a separate CSRF value, and both expiries. The raw token leaves
 * this process only inside a cookie; the DB keeps only its SHA-256.
 */
export function newSession(now: Date = new Date()): NewSession {
  const token = randomToken(TOKEN_BYTES);
  return {
    token,
    tokenHash: sha256Hex(token),
    csrfToken: randomToken(TOKEN_BYTES),
    idleExpires: new Date(now.getTime() + SESSION.IDLE_MS),
    absExpires: new Date(now.getTime() + SESSION.ABSOLUTE_MS),
  };
}

export interface SessionLike {
  readonly idleExpires: Date;
  readonly absExpires: Date;
}

/**
 * A session is live when neither the sliding idle expiry nor the absolute
 * hard cap has passed. Both checks use the same `now` so a tick-rollover
 * cannot pass idle and fail absolute (or vice-versa).
 */
export function isSessionLive(s: SessionLike, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t < s.idleExpires.getTime() && t < s.absExpires.getTime();
}

/**
 * Slide the idle expiry forward on each authenticated request — up to, but
 * never beyond, the absolute cap. Returns the new idle expiry, or null if
 * the current idle expiry already matches (so the DB write can be skipped
 * for a short burst of requests from the same client).
 *
 * The one-second threshold is deliberate: it keeps the DB quiet without
 * letting the idle window drift measurably.
 */
export function slideIdleExpiry(s: SessionLike, now: Date = new Date()): Date | null {
  const candidate = Math.min(now.getTime() + SESSION.IDLE_MS, s.absExpires.getTime());
  if (candidate - s.idleExpires.getTime() < 1_000) return null;
  return new Date(candidate);
}
