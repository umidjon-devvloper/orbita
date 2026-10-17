import { evaluateMeasure, type EvidenceItem, type Fraction } from "./evidence.js";
import { clamp, divHalfUp, sum } from "./math.js";
import type { MetricConfig } from "./rubric.js";
import { SCORE_MAX, type Score } from "./score.js";

/**
 * Linear score of value = num/den between floor and target (both on `scale`), clamped to 0–100.
 * score = (num·scale − floor·den) · 10000 / ((target − floor) · den), rounded half-up once.
 */
export function linearScore(value: Fraction, floor: bigint, target: bigint, scale: bigint): Score {
  const n = value.num * scale - floor * value.den;
  if (n <= 0n) return 0n;
  return clamp(divHalfUp(n * SCORE_MAX, (target - floor) * value.den), 0n, SCORE_MAX);
}

/** value ÷ target, capped at 100. */
export function ratioScore(value: Fraction, target: bigint): Score {
  return clamp(divHalfUp(value.num * SCORE_MAX, value.den * target), 0n, SCORE_MAX);
}

export interface QuizAnswer {
  readonly points: bigint;
  /** exact-set match for multiple choice; no partial credit by default */
  readonly correct: boolean;
}

/** earned / max × 100. null when there are no questions (cannot score). */
export function quizScore(answers: readonly QuizAnswer[]): Score | null {
  const max = sum(answers.map((a) => a.points));
  if (max <= 0n) return null;
  return divHalfUp(sum(answers.filter((a) => a.correct).map((a) => a.points)) * SCORE_MAX, max);
}

/** Multiple-choice correctness: selected ids must equal the correct ids exactly. */
export function isExactMatch(selected: readonly string[], correct: readonly string[]): boolean {
  const s = new Set(selected);
  const c = new Set(correct);
  return s.size === c.size && [...s].every((x) => c.has(x));
}

export interface MetricResult {
  readonly value: Fraction | null;
  readonly score: Score | null;
}

export function scoreMetric(config: MetricConfig, items: readonly EvidenceItem[]): MetricResult {
  const value = evaluateMeasure(config.measure, items);
  if (value === null) return { value, score: null };
  const score =
    config.kind === "ratio"
      ? ratioScore(value, config.target)
      : linearScore(value, config.floor, config.target, config.scale);
  return { value, score };
}
