// Worked examples EX1–EX10 from docs/SCORING_MODEL.md. These numbers are the contract:
// if a formula change alters any of them, bump CALC_VERSION and update the document.
import { describe, expect, it } from "vitest";
import { pendingServiceFee } from "./evidence.js";
import { checkPromotion, recommendStartingLevel } from "./levels.js";
import { quizScore } from "./metrics.js";
import { rankCohort } from "./ranking.js";
import { allocateRewards, type RewardCandidate } from "./rewards.js";
import { validateRubric, type CriterionDef } from "./rubric.js";
import { recommendSalary } from "./salary.js";
import { computeAssessment, type AssessmentOutcome } from "./scoring.js";
import {
  ev,
  levels,
  manual,
  quiz,
  repeat,
  supportFeedback,
  supportRecords,
  supportRubric,
} from "./test/fixtures.js";

function complete(r: ReturnType<typeof computeAssessment>): AssessmentOutcome {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
}
const scoreOf = (o: AssessmentOutcome, key: string) => o.criteria.find((c) => c.key === key)?.score;

describe("EX1 customer support monthly performance", () => {
  const training = ev("TRAINING");
  const m1 = ev("MENTORING");
  const m2 = ev("MENTORING");
  const out = complete(
    computeAssessment({
      rubric: { criteria: supportRubric, allowRenormalization: false },
      inputs: { learning: { humanScore: 7000n, aiSuggestedScore: 7500n }, sharing: { humanScore: 6000n } },
      evidence: [...supportRecords(), ...supportFeedback(), training, m1, m2],
      allocations: { [training.id]: "learning", [m1.id]: "sharing", [m2.id]: "sharing" },
    }),
  );

  it("computes each criterion exactly", () => {
    expect(scoreOf(out, "quality")).toBe(8684n);
    expect(scoreOf(out, "csat")).toBe(8444n);
    expect(scoreOf(out, "volume")).toBe(9767n);
    expect(out.criteria.find((c) => c.key === "volume")?.value).toEqual({ num: 586n, den: 1n });
  });

  it("totals 81.97 with a single rounding", () => {
    expect(out.status).toBe("COMPLETE");
    expect(out.numerator).toBe(81_974_000n);
    expect(out.total).toBe(8197n);
  });

  it("keeps the AI suggestion separate from the human score", () => {
    const learning = out.criteria.find((c) => c.key === "learning");
    expect(learning?.aiSuggestedScore).toBe(7500n);
    expect(learning?.score).toBe(7000n);
    expect(learning?.scoreSource).toBe("human");
  });
});

describe("EX2 rounding once", () => {
  it("85.516848 → 85.52", () => {
    const out = complete(
      computeAssessment({
        rubric: {
          criteria: [manual("a", 3334n), manual("b", 3333n), manual("c", 3333n)],
          allowRenormalization: false,
        },
        inputs: { a: { humanScore: 8733n }, b: { humanScore: 9117n }, c: { humanScore: 7805n } },
        evidence: [],
        allocations: {},
      }),
    );
    expect(out.numerator).toBe(85_516_848n);
    expect(out.total).toBe(8552n);
  });
});

describe("EX3 invalid weights", () => {
  it("reports the 5.00 % difference", () => {
    const r = validateRubric({
      criteria: [manual("a", 4000n), manual("b", 3500n), manual("c", 2000n)],
      allowRenormalization: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error.details?.issues).toEqual([
        { code: "rubric.weightsMustSumTo100", sumBp: 9500n, diffBp: 500n },
      ]);
  });
});

describe("EX4 incomplete", () => {
  it("lists have/need/pending and gives no total", () => {
    const m1 = ev("MENTORING");
    const m2 = ev("MENTORING", {}, "SUBMITTED");
    const out = complete(
      computeAssessment({
        rubric: {
          criteria: [
            manual("quality", 5000n),
            manual("mentoring", 5000n, {
              contributionTypes: ["MENTORING"],
              evidenceRequired: true,
              minEvidenceCount: 2,
            }),
          ],
          allowRenormalization: false,
        },
        inputs: { quality: { humanScore: 8000n } },
        evidence: [m1, m2],
        allocations: { [m1.id]: "mentoring", [m2.id]: "mentoring" },
      }),
    );
    expect(out.status).toBe("INCOMPLETE");
    expect(out.total).toBeNull();
    expect(out.missing).toEqual([
      { key: "mentoring", reason: "evidence", have: 1, need: 2, pending: 1 },
      { key: "mentoring", reason: "unscored" },
    ]);
  });
});

describe("EX5 not applicable", () => {
  const criteria = [
    manual("a", 4000n),
    manual("b", 3000n),
    manual("acq", 3000n, { allowNotApplicable: true }),
  ];
  const inputs = { a: { humanScore: 8000n }, b: { humanScore: 9000n }, acq: { notApplicable: true } };

  it("renormalizes when allowed: 84.29", () => {
    const out = complete(
      computeAssessment({
        rubric: { criteria, allowRenormalization: true },
        inputs,
        evidence: [],
        allocations: {},
      }),
    );
    expect(out.weightSum).toBe(7000n);
    expect(out.total).toBe(8429n);
  });

  it("is invalid when the rubric does not allow it", () => {
    const r = computeAssessment({
      rubric: { criteria, allowRenormalization: false },
      inputs,
      evidence: [],
      allocations: {},
    });
    expect(r.ok ? null : r.error.code).toBe("assessment.notApplicableNotAllowed");
  });
});

describe("EX6 revenue counts only verified serviceFee", () => {
  const sales = [
    ev("SALE", { serviceFee: 4_200_000n, governmentFee: 18_000_000n }),
    ev("SALE", { serviceFee: 5_100_000n, governmentFee: 0n }),
    ev("SALE", { serviceFee: 3_300_000n, governmentFee: 22_000_000n }),
    ev("SALE", { serviceFee: 2_000_000n }, "SUBMITTED"),
    ev("SALE", { serviceFee: 1_500_000n }, "REJECTED"),
  ];
  const revenue: CriterionDef = {
    key: "revenue",
    weightBp: 10000n,
    method: "EVIDENCE_METRIC",
    metric: {
      kind: "ratio",
      measure: { op: "sum", field: "serviceFee", types: ["SALE"] },
      target: 15_000_000n,
    },
    isGate: false,
    evidenceRequired: false,
    minEvidenceCount: 0,
    allowNotApplicable: false,
  };

  it("12 600 000 of 15 000 000 → 84.00", () => {
    const out = complete(
      computeAssessment({
        rubric: { criteria: [revenue], allowRenormalization: false },
        inputs: {},
        evidence: sales,
        allocations: {},
      }),
    );
    const c = out.criteria[0];
    expect(c?.value).toEqual({ num: 12_600_000n, den: 1n });
    expect(c?.score).toBe(8400n);
    expect(c?.evidence).toEqual({ verified: 3, pending: 1, rejected: 1 });
    expect(pendingServiceFee(sales)).toBe(2_000_000n);
  });
});

describe("EX7 candidate: government services operator", () => {
  const knowledge = quizScore(repeat(20, (i) => ({ points: 1n, correct: i < 16 })));
  const privacy = quizScore(repeat(10, (i) => ({ points: 1n, correct: i < 9 })));
  const out = complete(
    computeAssessment({
      rubric: {
        criteria: [
          quiz("knowledge", 3500n),
          manual("procedure", 2500n),
          manual("communication", 2000n),
          quiz("privacy", 2000n, { isGate: true, gateMinScore: 8000n }),
        ],
        allowRenormalization: false,
      },
      inputs: {
        knowledge: { quiz: repeat(20, (i) => ({ points: 1n, correct: i < 16 })) },
        procedure: { humanScore: 7500n },
        communication: { humanScore: 8200n, aiSuggestedScore: 7800n },
        privacy: { quiz: repeat(10, (i) => ({ points: 1n, correct: i < 9 })) },
      },
      evidence: [],
      allocations: {},
    }),
  );

  it("scores 81.15 and passes the privacy gate", () => {
    expect(knowledge).toBe(8000n);
    expect(privacy).toBe(9000n);
    expect(out.total).toBe(8115n);
    expect(out.gates).toEqual([{ key: "privacy", min: 8000n, score: 9000n, passed: true }]);
  });

  it("recommends Middle", () => {
    const r = recommendStartingLevel(levels, 8115n, {
      privacy: 9000n,
      procedure: 7500n,
      knowledge: 8000n,
      communication: 8200n,
    });
    expect(r.level).toBe("middle");
    expect(r.trace.map((t) => [t.level, t.totalOk, t.failedGates.map((f) => f.competency)])).toEqual([
      ["junior", true, []],
      ["middle", true, []],
      ["senior", false, ["procedure"]],
    ]);
  });

  it("recommends 6 287 000 – 6 687 000 UZS inside the Middle band", () => {
    const r = recommendSalary({
      band: { id: "band-mid", min: 5_000_000n, max: 7_000_000n, approved: false },
      total: 8115n,
      levelMin: 7000n,
      nextLevelMin: 8500n,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        status: "OK",
        bandId: "band-mid",
        bandApproved: false,
        point: 6_486_667n,
        low: 6_287_000n,
        high: 6_687_000n,
        progressNum: 1115n,
        progressDen: 1500n,
      },
    });
  });
});

describe("EX8 promotion Middle → Senior", () => {
  it("is blocked by the privacy gate even with a high total", () => {
    const r = checkPromotion(levels, "middle", "senior", {
      total: 9120n,
      competencyScores: { privacy: 7200n, procedure: 9300n },
      approvedAssessments: 2,
      monthsAtCurrent: 8,
    });
    expect(r.ok && r.value).toMatchObject({
      eligible: false,
      totalOk: true,
      failedGates: [{ competency: "privacy", min: 8000n, score: 7200n }],
    });
  });

  it("is eligible when all gates pass", () => {
    const r = checkPromotion(levels, "middle", "senior", {
      total: 8610n,
      competencyScores: { privacy: 8800n, procedure: 8700n },
      approvedAssessments: 2,
      monthsAtCurrent: 8,
    });
    expect(r.ok && r.value.eligible).toBe(true);
  });
});

describe("EX9 ranking", () => {
  const row = (id: string, total: bigint) => ({
    id,
    total,
    approved: true,
    specialtyId: "support",
    rubricVersionId: "v1",
    periodId: "2026-09",
  });
  const cohort = [
    row("EMP-a1", 8810n),
    row("EMP-b2", 8500n),
    row("EMP-c3", 8500n),
    row("EMP-d4", 7940n),
    row("EMP-e5", 7120n),
  ];

  it("uses competition ranking 1,2,2,4,5", () => {
    const r = rankCohort(cohort);
    expect(r.ok && r.value.rows.map((x) => [x.id, x.rank])).toEqual([
      ["EMP-a1", 1],
      ["EMP-b2", 2],
      ["EMP-c3", 2],
      ["EMP-d4", 4],
      ["EMP-e5", 5],
    ]);
  });

  it("does not rank a cohort of 2", () => {
    const r = rankCohort(cohort.slice(0, 2));
    expect(r.ok && r.value).toMatchObject({ ranked: false, reason: "cohort.tooSmall" });
  });
});

describe("EX10 rewards", () => {
  const people: RewardCandidate[] = [
    { id: "EMP-a1", total: 8810n, approved: true },
    { id: "EMP-b2", total: 8500n, approved: true },
    { id: "EMP-c3", total: 8500n, approved: true },
    { id: "EMP-d4", total: 7940n, approved: true },
    { id: "EMP-e5", total: 7120n, approved: true },
  ];
  const policy = { kind: "CASH" as const, budget: 6_000_000n, threshold: 7500n, step: 1000n };
  const amounts = (r: ReturnType<typeof allocateRewards>) =>
    r.ok ? [r.value.allocations.map((a) => a.amount), r.value.unallocated] : null;

  it("cap 2 500 000", () => {
    const r = allocateRewards({ ...policy, cap: 2_500_000n, redistribute: false }, people);
    expect(amounts(r)).toEqual([[2_096_000n, 1_600_000n, 1_600_000n, 704_000n], 0n]);
    expect(r.ok && r.value.ineligible).toEqual([{ id: "EMP-e5", reason: "belowThreshold" }]);
  });

  it("cap 2 000 000 without redistribution", () => {
    expect(amounts(allocateRewards({ ...policy, cap: 2_000_000n, redistribute: false }, people))).toEqual([
      [2_000_000n, 1_600_000n, 1_600_000n, 704_000n],
      96_000n,
    ]);
  });

  it("cap 2 000 000 with redistribution", () => {
    expect(amounts(allocateRewards({ ...policy, cap: 2_000_000n, redistribute: true }, people))).toEqual([
      [2_000_000n, 1_639_000n, 1_639_000n, 721_000n],
      1_000n,
    ]);
  });
});
