/**
 * Integer arithmetic helpers. Every rounding in the domain goes through these functions.
 * All inputs are bigint; no floating point anywhere in packages/domain.
 */

/** n / d rounded half-up. Requires n >= 0 and d > 0. */
export function divHalfUp(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("divHalfUp: divisor must be positive");
  if (n < 0n) throw new RangeError("divHalfUp: dividend must be non-negative");
  return (2n * n + d) / (2n * d);
}

/** n / d rounded down. Requires n >= 0 and d > 0. */
export function divFloor(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("divFloor: divisor must be positive");
  if (n < 0n) throw new RangeError("divFloor: dividend must be non-negative");
  return n / d;
}

export const clamp = (x: bigint, lo: bigint, hi: bigint): bigint => (x < lo ? lo : x > hi ? hi : x);

export const sum = (xs: readonly bigint[]): bigint => xs.reduce((a, b) => a + b, 0n);

export const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
