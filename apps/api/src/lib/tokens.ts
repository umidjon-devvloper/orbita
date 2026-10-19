import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Random tokens used for session cookies, CSRF values and password reset
 * links. 32 bytes (256 bits) base64url-encoded gives a 43-character token
 * with 128-bit security margin against guessing. Base64url is URL-safe —
 * no `+`, `/`, `=` — so the token can appear in cookies, headers and emails
 * without encoding bugs.
 */
export const TOKEN_BYTES = 32;

export function randomToken(bytes: number = TOKEN_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * SHA-256 of the token, as lowercase hex. The database never stores the raw
 * token — only its hash — so a snapshot of the DB does not leak live
 * credentials. Lookup still works: the server hashes the token from the
 * request and queries by `tokenHash`.
 */
export function sha256Hex(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time compare for CSRF tokens. `===` leaks length and prefix info
 * through timing; a motivated attacker on a shared network can turn that into
 * a byte-at-a-time attack. Returns false on any length mismatch without
 * calling the native compare (which throws on different lengths).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
