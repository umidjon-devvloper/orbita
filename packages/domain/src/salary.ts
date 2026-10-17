import { clamp, divHalfUp } from "./math.js";
import { roundHalfUpToStep, type Uzs } from "./money.js";
import { err, ok, type Result } from "./result.js";
import { SCORE_MAX, type Score } from "./score.js";

export interface SalaryBandInput {
  readonly id: string;
  readonly min: Uzs;
  readonly max: Uzs;
  readonly approved: boolean;
}

export interface SalaryInput {
  /** approved band effective on the decision date for (position, level); null = not configured */
  readonly band: SalaryBandInput | null;
  readonly total: Score;
  /** entry threshold of the recommended level */
  readonly levelMin: Score;
  /** entry threshold of the next level; null at the top level (progress measured up to 100.00) */
  readonly nextLevelMin: Score | null;
  /** half-width of the range as basis points of band width (default 1000 = 10 %) */
  readonly spreadBp?: bigint;
  readonly step?: Uzs;
}

export type SalaryRecommendation =
  | { readonly status: "NO_BAND" }
  | {
      readonly status: "OK";
      readonly bandId: string;
      readonly bandApproved: boolean;
      readonly point: Uzs;
      readonly low: Uzs;
      readonly high: Uzs;
      readonly progressNum: bigint;
      readonly progressDen: bigint;
    };

/**
 * Explainable position inside an admin-configured band. Uses only configured data — never market data.
 * A recommendation for a human; it never changes payroll.
 */
export function recommendSalary(input: SalaryInput): Result<SalaryRecommendation, "salary.invalidInput"> {
  const { band } = input;
  if (band === null) return ok({ status: "NO_BAND" });
  const upper = input.nextLevelMin ?? SCORE_MAX;
  const step = input.step ?? 1000n;
  const spreadBp = input.spreadBp ?? 1000n;
  if (band.min < 0n || band.max < band.min || upper <= input.levelMin || step <= 0n || spreadBp < 0n)
    return err("salary.invalidInput");

  const width = band.max - band.min;
  const progressDen = upper - input.levelMin;
  const progressNum = clamp(input.total - input.levelMin, 0n, progressDen);
  const point = band.min + divHalfUp(width * progressNum, progressDen);
  const spread = divHalfUp(width * spreadBp, 10000n);
  const low = clamp(roundHalfUpToStep(point > spread ? point - spread : 0n, step), band.min, band.max);
  const high = clamp(roundHalfUpToStep(point + spread, step), band.min, band.max);
  return ok({
    status: "OK",
    bandId: band.id,
    bandApproved: band.approved,
    point,
    low,
    high,
    progressNum,
    progressDen,
  });
}
