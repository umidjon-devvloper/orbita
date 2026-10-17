import { err, ok, type Result } from "./result.js";
import type { Score } from "./score.js";

export interface RankRow {
  readonly id: string;
  readonly specialtyId: string;
  readonly rubricVersionId: string;
  readonly periodId: string;
  readonly total: Score;
  readonly approved: boolean;
}

export interface RankedRow extends RankRow {
  readonly rank: number | null;
}

export interface RankingOutcome {
  readonly ranked: boolean;
  readonly reason: "cohort.tooSmall" | null;
  readonly rows: readonly RankedRow[];
  /** not approved yet — shown separately, never ranked */
  readonly excluded: readonly string[];
}

/**
 * Competition ranking (1, 2, 2, 4) inside ONE cohort: same specialty + rubric version + period.
 * Mixed cohorts are rejected — comparisons across specialties are misleading by design.
 */
export function rankCohort(
  rows: readonly RankRow[],
  minCohort = 3,
): Result<RankingOutcome, "ranking.mixedCohort"> {
  const first = rows[0];
  if (
    first !== undefined &&
    rows.some(
      (r) =>
        r.specialtyId !== first.specialtyId ||
        r.rubricVersionId !== first.rubricVersionId ||
        r.periodId !== first.periodId,
    )
  )
    return err("ranking.mixedCohort");

  const approved = rows.filter((r) => r.approved);
  const excluded = rows.filter((r) => !r.approved).map((r) => r.id);
  const sorted = [...approved].sort((a, b) =>
    b.total > a.total ? 1 : b.total < a.total ? -1 : a.id.localeCompare(b.id),
  );
  if (sorted.length < minCohort)
    return ok({
      ranked: false,
      reason: "cohort.tooSmall",
      rows: sorted.map((r) => ({ ...r, rank: null })),
      excluded,
    });

  let rank = 0;
  let previous: Score | null = null;
  const ranked = sorted.map((r, i) => {
    if (r.total !== previous) rank = i + 1;
    previous = r.total;
    return { ...r, rank };
  });
  return ok({ ranked: true, reason: null, rows: ranked, excluded });
}
