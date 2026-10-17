import { err, ok, type Result } from "./result.js";
import type { Score } from "./score.js";

export interface LevelRequirementDef {
  readonly competency: string;
  readonly min: Score;
  /** gate: must pass regardless of total. Non-gate requirements are advisory shortfalls. */
  readonly isGate: boolean;
}

export interface LevelDef {
  readonly key: string;
  readonly rank: number;
  readonly isActive: boolean;
  readonly minTotal: Score;
  readonly requirements: readonly LevelRequirementDef[];
  readonly minApprovedAssessments?: number;
  readonly minMonthsAtPrevious?: number;
}

export interface FailedRequirement {
  readonly competency: string;
  readonly min: Score;
  readonly score: Score | null;
}

export interface LevelTrace {
  readonly level: string;
  readonly minTotal: Score;
  readonly totalOk: boolean;
  readonly failedGates: readonly FailedRequirement[];
}

const activeSorted = (levels: readonly LevelDef[]): LevelDef[] =>
  levels.filter((l) => l.isActive).sort((a, b) => a.rank - b.rank);

/** Requirements of all levels up to and including `upto` (strictest min per competency wins). */
function cumulative(levels: readonly LevelDef[], upto: number): LevelRequirementDef[] {
  const acc = new Map<string, LevelRequirementDef>();
  for (const l of levels.slice(0, upto + 1))
    for (const r of l.requirements) {
      const prev = acc.get(r.competency);
      acc.set(r.competency, {
        competency: r.competency,
        min: prev !== undefined && prev.min > r.min ? prev.min : r.min,
        isGate: r.isGate || (prev?.isGate ?? false),
      });
    }
  return [...acc.values()];
}

const failing = (
  reqs: readonly LevelRequirementDef[],
  scores: Readonly<Record<string, Score>>,
): FailedRequirement[] =>
  reqs
    .filter((r) => {
      const s = scores[r.competency];
      return s === undefined || s < r.min;
    })
    .map((r) => ({ competency: r.competency, min: r.min, score: scores[r.competency] ?? null }));

/**
 * Highest active level a candidate demonstrates: levels are checked in rank order and the
 * first failure stops the climb. A recommendation only — a human decides the hiring level.
 */
export function recommendStartingLevel(
  levels: readonly LevelDef[],
  total: Score,
  competencyScores: Readonly<Record<string, Score>>,
): { readonly level: string | null; readonly trace: readonly LevelTrace[] } {
  const sorted = activeSorted(levels);
  const trace: LevelTrace[] = [];
  let level: string | null = null;
  for (const [i, l] of sorted.entries()) {
    const failedGates = failing(
      cumulative(sorted, i).filter((r) => r.isGate),
      competencyScores,
    );
    const totalOk = total >= l.minTotal;
    trace.push({ level: l.key, minTotal: l.minTotal, totalOk, failedGates });
    if (!totalOk || failedGates.length > 0) break;
    level = l.key;
  }
  return { level, trace };
}

export interface PromotionFacts {
  readonly total: Score;
  readonly competencyScores: Readonly<Record<string, Score>>;
  readonly approvedAssessments: number;
  readonly monthsAtCurrent: number;
}

export interface PromotionCheck {
  readonly target: string;
  readonly eligible: boolean;
  readonly totalOk: boolean;
  readonly minTotal: Score;
  readonly failedGates: readonly FailedRequirement[];
  /** non-gate requirements not met — shown to the approver, do not block */
  readonly shortfalls: readonly FailedRequirement[];
  readonly blockers: readonly ("approvedAssessments" | "timeAtLevel")[];
}

/**
 * Eligibility for one target level. Never lowers the current level: "not eligible" only means
 * "not yet". The outcome is a recommendation; approval is a separate human action.
 */
export function checkPromotion(
  levels: readonly LevelDef[],
  currentKey: string | null,
  targetKey: string,
  facts: PromotionFacts,
): Result<PromotionCheck, "promotion.invalidTarget"> {
  const sorted = activeSorted(levels);
  const ti = sorted.findIndex((l) => l.key === targetKey);
  const ci = currentKey === null ? -1 : sorted.findIndex((l) => l.key === currentKey);
  const target = sorted[ti];
  if (target === undefined || ti <= ci || (currentKey !== null && ci === -1))
    return err("promotion.invalidTarget", { currentKey, targetKey });

  const reqs = cumulative(sorted, ti);
  const failedGates = failing(
    reqs.filter((r) => r.isGate),
    facts.competencyScores,
  );
  const shortfalls = failing(
    reqs.filter((r) => !r.isGate),
    facts.competencyScores,
  );
  const blockers: ("approvedAssessments" | "timeAtLevel")[] = [];
  if (facts.approvedAssessments < (target.minApprovedAssessments ?? 1)) blockers.push("approvedAssessments");
  if (facts.monthsAtCurrent < (target.minMonthsAtPrevious ?? 0)) blockers.push("timeAtLevel");
  const totalOk = facts.total >= target.minTotal;
  return ok({
    target: targetKey,
    eligible: totalOk && failedGates.length === 0 && blockers.length === 0,
    totalOk,
    minTotal: target.minTotal,
    failedGates,
    shortfalls,
    blockers,
  });
}
