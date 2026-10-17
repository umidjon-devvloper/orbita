import { describe, expect, it } from "vitest";
import { validateRubric, type CriterionDef, type RubricDef } from "./rubric.js";
import { CALC_VERSION, computeAssessment, type AssessmentInput } from "./scoring.js";
import { base, ev, manual, quiz, supportRubric } from "./test/fixtures.js";

const issuesOf = (r: RubricDef) => {
  const v = validateRubric(r);
  return v.ok ? [] : (v.error.details?.issues as { code: string }[]).map((i) => i.code);
};
const rubric = (criteria: CriterionDef[], allowRenormalization = false): RubricDef => ({
  criteria,
  allowRenormalization,
});
const metric = (key: string, weightBp: bigint, m: CriterionDef["metric"]): CriterionDef => ({
  ...base,
  key,
  weightBp,
  method: "EVIDENCE_METRIC",
  ...(m ? { metric: m } : {}),
});

describe("validateRubric", () => {
  it("accepts the demo support rubric", () => expect(validateRubric(rubric(supportRubric)).ok).toBe(true));

  it("collects every issue at once", () => {
    expect(issuesOf(rubric([]))).toEqual(["rubric.empty"]);
    expect(
      issuesOf(
        rubric([
          manual("a", 12000n),
          manual("a", -1n),
          manual("g", 0n, { isGate: true }),
          manual("e", 0n, { evidenceRequired: true, minEvidenceCount: 0 }),
          manual("f", 0n, { minEvidenceCount: 2 }),
          manual("m", 0n, {
            metric: {
              kind: "ratio",
              measure: { op: "sum", field: "serviceFee", types: ["SALE"] },
              target: 1n,
            },
          }),
          manual("c", 0n, { contributionTypes: ["SALE"] }),
        ]),
      ),
    ).toEqual([
      "rubric.weightOutOfRange",
      "rubric.duplicateKey",
      "rubric.weightOutOfRange",
      "rubric.gateMinRequired",
      "rubric.minEvidenceInvalid",
      "rubric.minEvidenceInvalid",
      "rubric.metricNotAllowed",
      "rubric.contributionTypeInvalid",
      "rubric.weightsMustSumTo100",
    ]);
  });

  it("rejects gate minimums outside 0–100", () =>
    expect(issuesOf(rubric([manual("g", 10000n, { isGate: true, gateMinScore: 10001n })]))).toEqual([
      "rubric.gateMinRequired",
    ]));

  it("checks metric configuration", () => {
    const sale = { op: "sum", field: "serviceFee", types: ["SALE"] } as const;
    expect(issuesOf(rubric([metric("x", 10000n, undefined)]))).toEqual(["rubric.metricRequired"]);
    expect(issuesOf(rubric([metric("x", 10000n, { kind: "ratio", measure: sale, target: 0n })]))).toEqual([
      "rubric.metricInvalid",
    ]);
    expect(
      issuesOf(rubric([metric("x", 10000n, { kind: "ratio", measure: { ...sale, types: [] }, target: 1n })])),
    ).toEqual(["rubric.metricInvalid"]);
    for (const [floor, target, scale] of [
      [5n, 5n, 1n],
      [-1n, 5n, 1n],
      [0n, 5n, 0n],
    ] as const)
      expect(
        issuesOf(rubric([metric("x", 10000n, { kind: "linear", measure: sale, floor, target, scale })])),
      ).toEqual(["rubric.metricInvalid"]);
    expect(
      issuesOf(
        rubric([
          metric("x", 10000n, {
            kind: "ratio",
            measure: { op: "sum", field: "quantity", types: ["MENTORING"] },
            target: 1n,
          }),
        ]),
      ),
    ).toEqual(["rubric.metricReadsContribution"]);
  });

  it("forbids two criteria reading the same field (double counting)", () => {
    const m = {
      kind: "ratio",
      measure: { op: "sum", field: "serviceFee", types: ["SALE"] },
      target: 1n,
    } as const;
    expect(issuesOf(rubric([metric("a", 5000n, m), metric("b", 5000n, m)]))).toEqual([
      "rubric.doubleCounting",
    ]);
  });
});

describe("computeAssessment errors and edge cases", () => {
  const two = rubric([manual("a", 5000n), manual("b", 5000n, { allowNotApplicable: true })], true);
  const input = (over: Partial<AssessmentInput>): AssessmentInput => ({
    rubric: two,
    inputs: {},
    evidence: [],
    allocations: {},
    ...over,
  });
  const code = (i: AssessmentInput) => {
    const r = computeAssessment(i);
    return r.ok ? r.value.status : r.error.code;
  };

  it("refuses an invalid rubric", () =>
    expect(code(input({ rubric: rubric([manual("a", 1n)]) }))).toBe("rubric.invalid"));
  it("refuses unknown criteria", () =>
    expect(code(input({ inputs: { zzz: { humanScore: 1n } } }))).toBe("assessment.unknownCriterion"));
  it("refuses out-of-range human or AI scores", () => {
    expect(code(input({ inputs: { a: { humanScore: 10001n } } }))).toBe("assessment.scoreOutOfRange");
    expect(code(input({ inputs: { a: { aiSuggestedScore: -1n } } }))).toBe("assessment.scoreOutOfRange");
  });
  it("refuses N/A on a criterion that does not allow it", () =>
    expect(code(input({ inputs: { a: { notApplicable: true } } }))).toBe(
      "assessment.notApplicableNotAllowed",
    ));
  it("refuses when nothing applicable carries weight", () =>
    expect(
      code(
        input({
          rubric: rubric([manual("a", 0n), manual("b", 10000n, { allowNotApplicable: true })], true),
          inputs: { a: { humanScore: 1n }, b: { notApplicable: true } },
        }),
      ),
    ).toBe("assessment.allNotApplicable"));

  it("validates evidence allocations", () => {
    const sale = ev("SALE");
    const course = ev("TRAINING");
    const r3 = rubric([manual("a", 10000n, { contributionTypes: ["MENTORING"] })]);
    const reason = (i: AssessmentInput) => {
      const r = computeAssessment(i);
      return r.ok ? null : r.error.details?.reason;
    };
    expect(reason(input({ rubric: r3, allocations: { nope: "a" } }))).toBe("unknown");
    expect(reason(input({ rubric: r3, evidence: [course], allocations: { [course.id]: "zzz" } }))).toBe(
      "unknown",
    );
    expect(reason(input({ rubric: r3, evidence: [sale], allocations: { [sale.id]: "a" } }))).toBe(
      "recordTypeNotAllocatable",
    );
    expect(reason(input({ rubric: r3, evidence: [course], allocations: { [course.id]: "a" } }))).toBe(
      "typeNotAccepted",
    );
    expect(
      reason(
        input({
          rubric: rubric([manual("a", 10000n)]),
          evidence: [course],
          allocations: { [course.id]: "a" },
        }),
      ),
    ).toBe("typeNotAccepted");
  });

  it("reports unscored quiz/manual and no-data metrics", () => {
    const r = computeAssessment({
      rubric: rubric([
        quiz("q", 3000n),
        manual("m", 3000n),
        {
          ...base,
          key: "x",
          weightBp: 4000n,
          method: "EVIDENCE_METRIC",
          metric: {
            kind: "linear",
            measure: { op: "share", flag: "errorFree", types: ["SERVICE_RECORD"] },
            floor: 0n,
            target: 1n,
            scale: 1n,
          },
        },
      ]),
      inputs: {},
      evidence: [],
      allocations: {},
    });
    expect(r.ok && r.value.missing).toEqual([
      { key: "q", reason: "unscored" },
      { key: "m", reason: "unscored" },
      { key: "x", reason: "noData" },
    ]);
    expect(r.ok && r.value.criteria.map((c) => c.scoreSource)).toEqual([null, null, null]);
  });

  it("evaluates gates: failed, and not applicable gate counts as not passed", () => {
    const g = rubric(
      [
        manual("a", 5000n, { isGate: true, gateMinScore: 8000n }),
        manual("b", 5000n, { isGate: true, gateMinScore: 1n, allowNotApplicable: true }),
      ],
      true,
    );
    const r = computeAssessment({
      rubric: g,
      inputs: { a: { humanScore: 7999n }, b: { notApplicable: true } },
      evidence: [],
      allocations: {},
    });
    expect(r.ok && r.value.gates).toEqual([
      { key: "a", min: 8000n, score: 7999n, passed: false },
      { key: "b", min: 1n, score: null, passed: false },
    ]);
    expect(r.ok && r.value.total).toBe(7999n);
    expect(r.ok && r.value.calcVersion).toBe(CALC_VERSION);
  });

  it("is deterministic (same input → identical output)", () => {
    const make = (): AssessmentInput => ({
      rubric: rubric([manual("a", 10000n)]),
      inputs: { a: { humanScore: 4242n } },
      evidence: [],
      allocations: {},
    });
    expect(computeAssessment(make())).toEqual(computeAssessment(make()));
  });
});
