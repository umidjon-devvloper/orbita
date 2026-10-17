import {
  countByStatus,
  isRecordType,
  type EvidenceCounts,
  type EvidenceItem,
  type Fraction,
} from "./evidence.js";
import { divHalfUp, sum } from "./math.js";
import { quizScore, scoreMetric, type QuizAnswer } from "./metrics.js";
import { err, ok, type Result } from "./result.js";
import { validateRubric, type CriterionDef, type RubricDef, type ScoringMethod } from "./rubric.js";
import { isValidScore, type Score, type WeightBp } from "./score.js";

/** Bump when any formula changes; stored in Assessment.calcVersion with the snapshot. */
export const CALC_VERSION = "1.0.0";

export interface CriterionInput {
  readonly quiz?: readonly QuizAnswer[];
  readonly humanScore?: Score;
  readonly aiSuggestedScore?: Score;
  readonly notApplicable?: boolean;
}

export interface AssessmentInput {
  readonly rubric: RubricDef;
  readonly inputs: Readonly<Record<string, CriterionInput>>;
  readonly evidence: readonly EvidenceItem[];
  /** CONTRIBUTION evidence id → criterion key (EvidenceAllocation rows) */
  readonly allocations: Readonly<Record<string, string>>;
}

export type Missing =
  | {
      readonly key: string;
      readonly reason: "evidence";
      readonly have: number;
      readonly need: number;
      readonly pending: number;
    }
  | { readonly key: string; readonly reason: "unscored" }
  | { readonly key: string; readonly reason: "noData" };

export interface CriterionOutcome {
  readonly key: string;
  readonly method: ScoringMethod;
  readonly weightBp: WeightBp;
  readonly notApplicable: boolean;
  readonly score: Score | null;
  readonly scoreSource: "quiz" | "metric" | "human" | null;
  readonly aiSuggestedScore: Score | null;
  readonly value: Fraction | null;
  readonly evidence: EvidenceCounts;
  readonly evidenceIds: readonly string[];
}

export interface GateOutcome {
  readonly key: string;
  readonly min: Score;
  readonly score: Score | null;
  readonly passed: boolean;
}

export interface AssessmentOutcome {
  readonly status: "COMPLETE" | "INCOMPLETE";
  readonly total: Score | null;
  readonly numerator: bigint | null;
  readonly weightSum: bigint | null;
  readonly criteria: readonly CriterionOutcome[];
  readonly gates: readonly GateOutcome[];
  readonly missing: readonly Missing[];
  readonly calcVersion: string;
}

export type ScoringErrorCode =
  | "rubric.invalid"
  | "assessment.unknownCriterion"
  | "assessment.scoreOutOfRange"
  | "assessment.notApplicableNotAllowed"
  | "assessment.allNotApplicable"
  | "allocation.invalid";

function checkAllocations(input: AssessmentInput): Result<true, "allocation.invalid"> {
  const byId = new Map(input.evidence.map((e) => [e.id, e]));
  const byKey = new Map(input.rubric.criteria.map((c) => [c.key, c]));
  for (const [evidenceId, key] of Object.entries(input.allocations)) {
    const e = byId.get(evidenceId);
    const c = byKey.get(key);
    if (e === undefined || c === undefined)
      return err("allocation.invalid", { evidenceId, key, reason: "unknown" });
    if (isRecordType(e.type))
      return err("allocation.invalid", { evidenceId, key, reason: "recordTypeNotAllocatable" });
    if (!(c.contributionTypes ?? []).includes(e.type))
      return err("allocation.invalid", { evidenceId, key, reason: "typeNotAccepted" });
  }
  return ok(true);
}

function scoreCriterion(
  c: CriterionDef,
  input: CriterionInput,
  evidence: readonly EvidenceItem[],
  allocated: readonly EvidenceItem[],
): Omit<CriterionOutcome, "key" | "method" | "weightBp" | "notApplicable"> {
  const ai = input.aiSuggestedScore ?? null;
  if (c.method === "EVIDENCE_METRIC" && c.metric !== undefined) {
    const types = c.metric.measure.types;
    const r = scoreMetric(c.metric, evidence);
    const used = evidence.filter((e) => e.status === "VERIFIED" && types.includes(e.type)).map((e) => e.id);
    return {
      score: r.score,
      scoreSource: r.score === null ? null : "metric",
      aiSuggestedScore: ai,
      value: r.value,
      evidence: countByStatus(evidence, types),
      evidenceIds: used,
    };
  }
  const counts = countByStatus(allocated);
  const ids = allocated.filter((e) => e.status === "VERIFIED").map((e) => e.id);
  if (c.method === "AUTO_QUIZ") {
    const s = quizScore(input.quiz ?? []);
    return {
      score: s,
      scoreSource: s === null ? null : "quiz",
      aiSuggestedScore: ai,
      value: null,
      evidence: counts,
      evidenceIds: ids,
    };
  }
  const h = input.humanScore ?? null;
  return {
    score: h,
    scoreSource: h === null ? null : "human",
    aiSuggestedScore: ai,
    value: null,
    evidence: counts,
    evidenceIds: ids,
  };
}

/**
 * Deterministic assessment calculation. Pure: same input → same output.
 * INCOMPLETE is a normal outcome (UI lists what is missing); invalid input is an error.
 */
export function computeAssessment(input: AssessmentInput): Result<AssessmentOutcome, ScoringErrorCode> {
  const valid = validateRubric(input.rubric);
  if (!valid.ok) return valid;
  const { criteria, allowRenormalization } = input.rubric;
  const known = new Set(criteria.map((c) => c.key));
  for (const key of Object.keys(input.inputs))
    if (!known.has(key)) return err("assessment.unknownCriterion", { key });
  for (const [key, ci] of Object.entries(input.inputs))
    for (const s of [ci.humanScore, ci.aiSuggestedScore])
      if (s !== undefined && !isValidScore(s)) return err("assessment.scoreOutOfRange", { key });
  const alloc = checkAllocations(input);
  if (!alloc.ok) return alloc;

  const outcomes: CriterionOutcome[] = [];
  const missing: Missing[] = [];
  const gates: GateOutcome[] = [];
  const scored: { readonly score: Score; readonly weightBp: WeightBp }[] = [];
  for (const c of criteria) {
    const ci = input.inputs[c.key] ?? {};
    const notApplicable = ci.notApplicable === true;
    if (notApplicable && !(allowRenormalization && c.allowNotApplicable))
      return err("assessment.notApplicableNotAllowed", { key: c.key });
    const allocated = input.evidence.filter((e) => input.allocations[e.id] === c.key);
    const r = scoreCriterion(c, ci, input.evidence, allocated);
    outcomes.push({ key: c.key, method: c.method, weightBp: c.weightBp, notApplicable, ...r });
    const score = notApplicable ? null : r.score;
    // validateRubric guarantees gateMinScore for gate criteria
    const gateMin = c.isGate ? c.gateMinScore : undefined;
    if (gateMin !== undefined)
      gates.push({ key: c.key, min: gateMin, score, passed: score !== null && score >= gateMin });
    if (notApplicable) continue;
    if (c.evidenceRequired && r.evidence.verified < c.minEvidenceCount)
      missing.push({
        key: c.key,
        reason: "evidence",
        have: r.evidence.verified,
        need: c.minEvidenceCount,
        pending: r.evidence.pending,
      });
    if (score === null)
      missing.push({ key: c.key, reason: c.method === "EVIDENCE_METRIC" ? "noData" : "unscored" });
    else scored.push({ score, weightBp: c.weightBp });
  }

  const weightSum = sum(outcomes.filter((o) => !o.notApplicable).map((o) => o.weightBp));
  if (weightSum === 0n) return err("assessment.allNotApplicable");

  if (missing.length > 0)
    return ok({
      status: "INCOMPLETE",
      total: null,
      numerator: null,
      weightSum: null,
      criteria: outcomes,
      gates,
      missing,
      calcVersion: CALC_VERSION,
    });

  const numerator = sum(scored.map((x) => x.score * x.weightBp));
  const total = divHalfUp(numerator, weightSum);
  return ok({
    status: "COMPLETE",
    total,
    numerator,
    weightSum,
    criteria: outcomes,
    gates,
    missing,
    calcVersion: CALC_VERSION,
  });
}
