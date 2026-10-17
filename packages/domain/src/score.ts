import { err, ok, type Result } from "./result.js";

/** Scores are integer hundredths: 0n … 10000n  (81.97 ↔ 8197n). */
export type Score = bigint;
/** Weights are basis points; a rubric's weights sum to exactly 10000n. */
export type WeightBp = bigint;

export const SCORE_MAX: Score = 10000n;
export const WEIGHT_TOTAL: WeightBp = 10000n;

export const isValidScore = (s: bigint): boolean => s >= 0n && s <= SCORE_MAX;

/** "81.97" → 8197n. Accepts 0–2 decimals, range 0.00–100.00. Used at API boundaries. */
export function parseScore(text: string): Result<Score, "score.invalid"> {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return err("score.invalid", { text });
  // group 1 is mandatory in the pattern; group 2 is optional
  const [, whole = "", frac = ""] = m;
  const value = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  return isValidScore(value) ? ok(value) : err("score.invalid", { text });
}

/** 8197n → "81.97". Display/transport format; never parse floats from it. */
export function formatScore(s: Score): string {
  const sign = s < 0n ? "-" : "";
  const a = s < 0n ? -s : s;
  return `${sign}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

/** "30.00" % → 3000n bp. Same grammar as scores. */
export const parsePercentToBp = (text: string): Result<WeightBp, "score.invalid"> => parseScore(text);
export const formatBpAsPercent = (bp: WeightBp): string => formatScore(bp);
