import { isRecordType, measureReads, type EvidenceType, type Measure } from "./evidence.js";
import { sum } from "./math.js";
import { err, ok, type Result } from "./result.js";
import { isValidScore, WEIGHT_TOTAL, type Score, type WeightBp } from "./score.js";

export type ScoringMethod = "AUTO_QUIZ" | "MANUAL" | "EVIDENCE_METRIC";

export type MetricConfig =
  /** value ÷ target, capped at 100 (target in measure units, e.g. UZS) */
  | { readonly kind: "ratio"; readonly measure: Measure; readonly target: bigint }
  /** 0 at floor → 100 at target; floor/target are integers on `scale` (e.g. 9000/10000 = 90 %) */
  | {
      readonly kind: "linear";
      readonly measure: Measure;
      readonly floor: bigint;
      readonly target: bigint;
      readonly scale: bigint;
    };

export interface CriterionDef {
  readonly key: string;
  readonly competencyKey?: string;
  readonly weightBp: WeightBp;
  readonly method: ScoringMethod;
  readonly metric?: MetricConfig;
  /** CONTRIBUTION evidence types that may be allocated to this criterion */
  readonly contributionTypes?: readonly EvidenceType[];
  readonly isGate: boolean;
  readonly gateMinScore?: Score;
  readonly evidenceRequired: boolean;
  readonly minEvidenceCount: number;
  readonly allowNotApplicable: boolean;
}

export interface RubricDef {
  readonly criteria: readonly CriterionDef[];
  readonly allowRenormalization: boolean;
}

export type RubricIssue =
  | { code: "rubric.empty" }
  | { code: "rubric.duplicateKey"; key: string }
  | { code: "rubric.weightOutOfRange"; key: string }
  | { code: "rubric.weightsMustSumTo100"; sumBp: bigint; diffBp: bigint }
  | { code: "rubric.gateMinRequired"; key: string }
  | { code: "rubric.metricRequired"; key: string }
  | { code: "rubric.metricNotAllowed"; key: string }
  | { code: "rubric.metricInvalid"; key: string }
  | { code: "rubric.metricReadsContribution"; key: string; type: EvidenceType }
  | { code: "rubric.contributionTypeInvalid"; key: string; type: EvidenceType }
  | { code: "rubric.doubleCounting"; read: string; keys: [string, string] }
  | { code: "rubric.minEvidenceInvalid"; key: string };

/** Validates a rubric version. Returns every issue at once so the editor can show them together. */
export function validateRubric(r: RubricDef): Result<RubricDef, "rubric.invalid"> {
  const issues: RubricIssue[] = [];
  if (r.criteria.length === 0) issues.push({ code: "rubric.empty" });

  const keys = new Set<string>();
  const reads = new Map<string, string>();
  for (const c of r.criteria) {
    if (keys.has(c.key)) issues.push({ code: "rubric.duplicateKey", key: c.key });
    keys.add(c.key);
    if (c.weightBp < 0n || c.weightBp > WEIGHT_TOTAL)
      issues.push({ code: "rubric.weightOutOfRange", key: c.key });
    if (c.isGate && (c.gateMinScore === undefined || !isValidScore(c.gateMinScore)))
      issues.push({ code: "rubric.gateMinRequired", key: c.key });
    if (c.evidenceRequired ? c.minEvidenceCount < 1 : c.minEvidenceCount !== 0)
      issues.push({ code: "rubric.minEvidenceInvalid", key: c.key });

    if (c.method === "EVIDENCE_METRIC") {
      if (c.metric === undefined) {
        issues.push({ code: "rubric.metricRequired", key: c.key });
      } else {
        const m = c.metric;
        const bad =
          m.measure.types.length === 0 ||
          (m.kind === "ratio" && m.target <= 0n) ||
          (m.kind === "linear" && (m.scale <= 0n || m.target <= m.floor || m.floor < 0n));
        if (bad) issues.push({ code: "rubric.metricInvalid", key: c.key });
        for (const t of m.measure.types)
          if (!isRecordType(t)) issues.push({ code: "rubric.metricReadsContribution", key: c.key, type: t });
        for (const read of measureReads(m.measure)) {
          const other = reads.get(read);
          if (other !== undefined) issues.push({ code: "rubric.doubleCounting", read, keys: [other, c.key] });
          else reads.set(read, c.key);
        }
      }
    } else if (c.metric !== undefined) {
      issues.push({ code: "rubric.metricNotAllowed", key: c.key });
    }
    for (const t of c.contributionTypes ?? [])
      if (isRecordType(t)) issues.push({ code: "rubric.contributionTypeInvalid", key: c.key, type: t });
  }

  const total = sum(r.criteria.map((c) => c.weightBp));
  if (r.criteria.length > 0 && total !== WEIGHT_TOTAL)
    issues.push({ code: "rubric.weightsMustSumTo100", sumBp: total, diffBp: WEIGHT_TOTAL - total });

  return issues.length === 0 ? ok(r) : err("rubric.invalid", { issues });
}
