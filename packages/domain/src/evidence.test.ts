import { describe, expect, it } from "vitest";
import {
  countByStatus,
  dedupeKey,
  pendingServiceFee,
  evaluateMeasure,
  isRecordType,
  measureReads,
  partitionDuplicates,
} from "./evidence.js";
import { isExactMatch, linearScore, quizScore, ratioScore, scoreMetric } from "./metrics.js";
import { ev } from "./test/fixtures.js";

describe("dedupe", () => {
  it("builds keys only for external sources with an id", () => {
    expect(dedupeKey("org", "CSV_IMPORT", " R-1 ")).toBe("org:CSV_IMPORT:R-1");
    expect(dedupeKey("org", "CRM", "R-1")).toBe("org:CRM:R-1");
    expect(dedupeKey("org", "MANUAL", "R-1")).toBeNull();
    expect(dedupeKey("org", "CRM", undefined)).toBeNull();
    expect(dedupeKey("org", "CRM", "  ")).toBeNull();
  });

  it("re-importing the same rows creates zero new records", () => {
    const rows = [{ k: "a" }, { k: "b" }, { k: "a" }, { k: null }];
    const first = partitionDuplicates(rows, (r) => r.k, new Set());
    expect(first.fresh).toEqual([{ k: "a" }, { k: "b" }, { k: null }]);
    expect(first.duplicates).toEqual([{ k: "a" }]);
    const again = partitionDuplicates(rows, (r) => r.k, new Set(["a", "b"]));
    expect(again.fresh).toEqual([{ k: null }]);
  });
});

describe("measures", () => {
  it("classifies record vs contribution evidence", () => {
    expect(isRecordType("SALE")).toBe(true);
    expect(isRecordType("MENTORING")).toBe(false);
  });

  it("reports what each measure reads", () => {
    expect(measureReads({ op: "sum", field: "serviceFee", types: ["SALE"] })).toEqual(["SALE.serviceFee"]);
    expect(measureReads({ op: "weightedCount", types: ["SERVICE_RECORD"], weightsByTier: {} })).toEqual([
      "SERVICE_RECORD.tier",
    ]);
    expect(measureReads({ op: "share", flag: "errorFree", types: ["SERVICE_RECORD"] })).toEqual([
      "SERVICE_RECORD.errorFree",
    ]);
    expect(measureReads({ op: "average", field: "csat", types: ["CUSTOMER_FEEDBACK"] })).toEqual([
      "CUSTOMER_FEEDBACK.csat",
    ]);
  });

  it("sums quantity and treats missing fields as zero; only VERIFIED counts", () => {
    const items = [
      ev("SERVICE_RECORD", { quantity: 3n }),
      ev("SERVICE_RECORD"),
      ev("SERVICE_RECORD", { quantity: 9n }, "SUBMITTED"),
    ];
    expect(evaluateMeasure({ op: "sum", field: "quantity", types: ["SERVICE_RECORD"] }, items)).toEqual({
      num: 3n,
      den: 1n,
    });
    expect(evaluateMeasure({ op: "sum", field: "serviceFee", types: ["SALE"] }, [ev("SALE")])).toEqual({
      num: 0n,
      den: 1n,
    });
  });

  it("weights unknown or missing tiers as zero", () => {
    const items = [
      ev("SERVICE_RECORD", { tier: "t9" }),
      ev("SERVICE_RECORD"),
      ev("SERVICE_RECORD", { tier: "t1" }),
    ];
    expect(
      evaluateMeasure({ op: "weightedCount", types: ["SERVICE_RECORD"], weightsByTier: { t1: 2n } }, items),
    ).toEqual({ num: 2n, den: 1n });
  });

  it("returns null (no data) for share/average without items", () => {
    expect(evaluateMeasure({ op: "share", flag: "errorFree", types: ["SERVICE_RECORD"] }, [])).toBeNull();
    expect(
      evaluateMeasure({ op: "average", field: "csat", types: ["CUSTOMER_FEEDBACK"] }, [
        ev("CUSTOMER_FEEDBACK"),
      ]),
    ).toBeNull();
  });

  it("counts statuses, optionally by type", () => {
    const items = [ev("SALE"), ev("SALE", {}, "SUBMITTED"), ev("MENTORING", {}, "REJECTED")];
    expect(countByStatus(items)).toEqual({ verified: 1, pending: 1, rejected: 1 });
    expect(countByStatus(items, ["SALE"])).toEqual({ verified: 1, pending: 1, rejected: 0 });
  });
});

describe("pending fees", () => {
  it("treats pending items without a fee as zero", () =>
    expect(
      pendingServiceFee([
        ev("SALE", {}, "SUBMITTED"),
        ev("SALE", { serviceFee: 5n }, "SUBMITTED"),
        ev("SALE", { serviceFee: 7n }),
      ]),
    ).toBe(5n));
});

describe("metrics", () => {
  it("linear: below floor is 0, above target is 100", () => {
    expect(linearScore({ num: 80n, den: 100n }, 9000n, 9900n, 10000n)).toBe(0n);
    expect(linearScore({ num: 9000n, den: 10000n }, 9000n, 9900n, 10000n)).toBe(0n);
    expect(linearScore({ num: 100n, den: 100n }, 9000n, 9900n, 10000n)).toBe(10000n);
  });
  it("ratio is capped at 100", () => expect(ratioScore({ num: 20n, den: 1n }, 10n)).toBe(10000n));
  it("quiz without questions cannot be scored", () => expect(quizScore([])).toBeNull());
  it("quiz weights points", () =>
    expect(
      quizScore([
        { points: 3n, correct: true },
        { points: 1n, correct: false },
      ]),
    ).toBe(7500n));
  it("multiple choice needs an exact set match", () => {
    expect(isExactMatch(["a", "b"], ["b", "a"])).toBe(true);
    expect(isExactMatch(["a"], ["a", "b"])).toBe(false);
    expect(isExactMatch(["a", "c"], ["a", "b"])).toBe(false);
  });
  it("scoreMetric returns null score when there is no data", () => {
    expect(
      scoreMetric(
        {
          kind: "linear",
          measure: { op: "share", flag: "errorFree", types: ["SERVICE_RECORD"] },
          floor: 0n,
          target: 1n,
          scale: 1n,
        },
        [],
      ),
    ).toEqual({ value: null, score: null });
  });
});
