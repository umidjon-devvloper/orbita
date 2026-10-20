import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters. OWASP's current baseline for interactive use (2024):
 * m = 19 MiB, t = 2, p = 1 — a ~50 ms hash on modern server CPUs.
 *
 * These are deliberately encoded in the hash string itself (via the `$m=…,t=…`
 * segment), so an existing hash is still verifiable after we raise the cost
 * here; we only need to rehash on the user's next successful login.
 *
 * `algorithm: 2` is `Argon2id` in @node-rs/argon2's const enum — inlined so
 * the file parses under `verbatimModuleSyntax`, which refuses const-enum
 * imports.
 */
const PARAMS = {
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, PARAMS);
}

/**
 * Returns true iff the supplied password matches the stored hash. Any thrown
 * error (malformed hash, wrong algorithm) is swallowed and treated as a miss —
 * the caller cannot distinguish a bad hash from a bad password, which is what
 * we want on the login path.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/** True when the hash should be rehashed under current parameters (e.g. after raising cost). */
export function needsRehash(storedHash: string): boolean {
  // Argon2 encoded hashes carry `$m=NUMBER,t=NUMBER,p=NUMBER$` — a cheap string check
  // is enough. If the string is unexpected, be conservative and rehash.
  const match = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
  if (match === null) return true;
  const m = Number(match[1]);
  const t = Number(match[2]);
  const p = Number(match[3]);
  return m < PARAMS.memoryCost || t < PARAMS.timeCost || p < PARAMS.parallelism;
}
