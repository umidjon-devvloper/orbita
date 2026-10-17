// Shared test fixtures. ILLUSTRATIVE values only (UNAPPROVED) — mirror docs/SCORING_MODEL.md.
import type { EvidenceItem, EvidenceStatus, EvidenceType } from "../evidence.js";
import type { LevelDef } from "../levels.js";
import type { CriterionDef } from "../rubric.js";

let seq = 0;
export function ev(
  type: EvidenceType,
  extra: Partial<EvidenceItem> = {},
  status: EvidenceStatus = "VERIFIED",
): EvidenceItem {
  seq += 1;
  return { id: `${type}-${String(seq)}`, type, status, ...extra };
}

export const repeat = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

export const base = {
  isGate: false,
  evidenceRequired: false,
  minEvidenceCount: 0,
  allowNotApplicable: false,
} as const satisfies Partial<CriterionDef>;

export const manual = (key: string, weightBp: bigint, extra: Partial<CriterionDef> = {}): CriterionDef => ({
  ...base,
  key,
  weightBp,
  method: "MANUAL",
  ...extra,
});

export const quiz = (key: string, weightBp: bigint, extra: Partial<CriterionDef> = {}): CriterionDef => ({
  ...base,
  key,
  weightBp,
  method: "AUTO_QUIZ",
  ...extra,
});

/** EX1 — Customer support monthly rubric v1 */
export const supportRubric: CriterionDef[] = [
  {
    ...base,
    key: "quality",
    weightBp: 3000n,
    method: "EVIDENCE_METRIC",
    metric: {
      kind: "linear",
      measure: { op: "share", flag: "errorFree", types: ["SERVICE_RECORD"] },
      floor: 9000n,
      target: 9900n,
      scale: 10000n,
    },
    evidenceRequired: true,
    minEvidenceCount: 1,
  },
  {
    ...base,
    key: "csat",
    weightBp: 2000n,
    method: "EVIDENCE_METRIC",
    metric: {
      kind: "linear",
      measure: { op: "average", field: "csat", types: ["CUSTOMER_FEEDBACK"] },
      floor: 300n,
      target: 480n,
      scale: 100n,
    },
    evidenceRequired: true,
    minEvidenceCount: 30,
  },
  {
    ...base,
    key: "volume",
    weightBp: 2000n,
    method: "EVIDENCE_METRIC",
    metric: {
      kind: "ratio",
      measure: { op: "weightedCount", types: ["SERVICE_RECORD"], weightsByTier: { t1: 1n, t2: 2n, t3: 3n } },
      target: 600n,
    },
  },
  manual("learning", 1500n, { contributionTypes: ["TRAINING"] }),
  manual("sharing", 1500n, { contributionTypes: ["MENTORING"], evidenceRequired: true, minEvidenceCount: 2 }),
];

/** 412 service records: 403 error-free; tiers 280×t1, 90×t2, 42×t3 */
export function supportRecords(): EvidenceItem[] {
  return repeat(412, (i) =>
    ev("SERVICE_RECORD", { errorFree: i < 403, tier: i < 280 ? "t1" : i < 370 ? "t2" : "t3" }),
  );
}

/** 50 feedback responses: 26×5 + 24×4 = 226 → average 4.52 */
export const supportFeedback = (): EvidenceItem[] =>
  repeat(50, (i) => ev("CUSTOMER_FEEDBACK", { csat: i < 26 ? 5n : 4n }));

/** EX7/EX8 example levels (UNAPPROVED) */
export const levels: LevelDef[] = [
  {
    key: "junior",
    rank: 1,
    isActive: true,
    minTotal: 0n,
    requirements: [{ competency: "privacy", min: 8000n, isGate: true }],
  },
  {
    key: "middle",
    rank: 2,
    isActive: true,
    minTotal: 7000n,
    requirements: [{ competency: "procedure", min: 7000n, isGate: true }],
  },
  {
    key: "senior",
    rank: 3,
    isActive: true,
    minTotal: 8500n,
    requirements: [{ competency: "procedure", min: 8500n, isGate: true }],
    minApprovedAssessments: 2,
    minMonthsAtPrevious: 6,
  },
  {
    key: "lead",
    rank: 4,
    isActive: true,
    minTotal: 9200n,
    requirements: [{ competency: "communication", min: 8500n, isGate: false }],
  },
];
