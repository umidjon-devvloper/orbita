import { describe, expect, it } from "vitest";
import { can, DEFAULT_ROLES, grantsFor, PERMISSIONS, separationOfDuties, type Actor } from "./authz.js";
import { checkPromotion, recommendStartingLevel, type LevelDef } from "./levels.js";
import { rankCohort } from "./ranking.js";
import { allocateRewards } from "./rewards.js";
import { recommendSalary } from "./salary.js";
import { levels } from "./test/fixtures.js";
import { canTransition, isTerminal, transition } from "./workflow.js";

describe("levels", () => {
  const facts = {
    total: 9500n,
    competencyScores: { privacy: 9000n, procedure: 9000n, communication: 9000n },
    approvedAssessments: 3,
    monthsAtCurrent: 12,
  };

  it("ignores inactive levels and orders by rank", () => {
    const shuffled: LevelDef[] = [levels[2]!, { ...levels[3]!, isActive: false }, levels[0]!, levels[1]!];
    expect(recommendStartingLevel(shuffled, 9900n, facts.competencyScores).level).toBe("senior");
  });

  it("returns null when even the first level fails", () =>
    expect(recommendStartingLevel(levels, 9000n, {}).level).toBeNull());

  it("rejects invalid targets", () => {
    for (const [cur, tgt] of [
      ["senior", "middle"],
      ["senior", "senior"],
      ["ghost", "lead"],
      ["middle", "ghost"],
    ] as const)
      expect(checkPromotion(levels, cur, tgt, facts).ok).toBe(false);
  });

  it("allows a first level from none", () =>
    expect(checkPromotion(levels, null, "junior", facts).ok).toBe(true));

  it("reports blockers and advisory shortfalls", () => {
    const r = checkPromotion(levels, "middle", "senior", {
      ...facts,
      approvedAssessments: 1,
      monthsAtCurrent: 2,
    });
    expect(r.ok && r.value).toMatchObject({
      eligible: false,
      blockers: ["approvedAssessments", "timeAtLevel"],
    });
    const lead = checkPromotion(levels, "senior", "lead", {
      ...facts,
      competencyScores: { privacy: 9000n, procedure: 9000n },
    });
    expect(lead.ok && lead.value).toMatchObject({
      eligible: true,
      shortfalls: [{ competency: "communication", min: 8500n, score: null }],
    });
  });

  it("keeps the strictest cumulative minimum and gate flag", () => {
    const ls: LevelDef[] = [
      {
        key: "a",
        rank: 1,
        isActive: true,
        minTotal: 0n,
        requirements: [{ competency: "x", min: 9000n, isGate: true }],
      },
      {
        key: "b",
        rank: 2,
        isActive: true,
        minTotal: 0n,
        requirements: [{ competency: "x", min: 5000n, isGate: false }],
      },
    ];
    const r = checkPromotion(ls, "a", "b", { ...facts, competencyScores: { x: 6000n } });
    expect(r.ok && r.value.failedGates).toEqual([{ competency: "x", min: 9000n, score: 6000n }]);
  });

  it("uses the default minimum of one approved assessment", () => {
    const r = checkPromotion(levels, "junior", "middle", { ...facts, approvedAssessments: 0 });
    expect(r.ok && r.value.blockers).toEqual(["approvedAssessments"]);
  });
});

describe("ranking", () => {
  const row = (id: string, total: bigint, extra = {}) => ({
    id,
    total,
    approved: true,
    specialtyId: "s",
    rubricVersionId: "v",
    periodId: "p",
    ...extra,
  });
  it("rejects mixed cohorts", () => {
    for (const diff of [{ specialtyId: "other" }, { rubricVersionId: "v2" }, { periodId: "p2" }])
      expect(rankCohort([row("a", 1n), row("b", 2n, diff)])).toEqual({
        ok: false,
        error: { code: "ranking.mixedCohort" },
      });
  });
  it("excludes unapproved rows and accepts an empty cohort", () => {
    const r = rankCohort([row("a", 3n), row("b", 2n), row("c", 1n), row("d", 9n, { approved: false })]);
    expect(r.ok && r.value.excluded).toEqual(["d"]);
    expect(r.ok && r.value.rows.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(rankCohort([]).ok).toBe(true);
  });
  it("sorts regardless of input order", () => {
    const r = rankCohort([row("c", 1n), row("b", 2n), row("a", 3n), row("d", 2n)]);
    expect(r.ok && r.value.rows.map((x) => [x.id, x.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["d", 2],
      ["c", 4],
    ]);
  });
  it("orders ties by id for display only", () => {
    const r = rankCohort([row("z", 5n), row("a", 5n), row("m", 5n)]);
    expect(r.ok && r.value.rows.map((x) => [x.id, x.rank])).toEqual([
      ["a", 1],
      ["m", 1],
      ["z", 1],
    ]);
  });
});

describe("rewards", () => {
  const people = [
    { id: "a", total: 9000n, approved: true },
    { id: "b", total: 8000n, approved: false },
    { id: "c", total: 7500n, approved: true },
  ];
  const policy = {
    kind: "CASH" as const,
    budget: 1_000_000n,
    threshold: 7500n,
    cap: 5_000_000n,
    step: 1000n,
    redistribute: true,
  };

  it("rejects invalid policies", () => {
    for (const bad of [{ step: 0n }, { cap: -1n }, { budget: -1n }])
      expect(allocateRewards({ ...policy, ...bad }, people).ok).toBe(false);
  });
  it("marks unapproved as ineligible; exactly-at-threshold gets 0", () => {
    const r = allocateRewards(policy, people);
    expect(r.ok && r.value.ineligible).toEqual([{ id: "b", reason: "notApproved" }]);
    expect(r.ok && r.value.allocations).toEqual([
      { id: "a", excess: 1500n, amount: 1_000_000n, capped: false },
      { id: "c", excess: 0n, amount: 0n, capped: false },
    ]);
  });
  it("recognition policies carry no amount", () => {
    const r = allocateRewards({ ...policy, kind: "RECOGNITION" }, people);
    expect(r.ok && r.value.allocations.map((x) => x.amount)).toEqual([null, null]);
  });
  it("stops when nobody can take more", () => {
    const r = allocateRewards({ ...policy, cap: 1000n }, [{ id: "a", total: 9000n, approved: true }]);
    expect(
      r.ok && [r.value.allocations[0]?.amount, r.value.allocations[0]?.capped, r.value.unallocated],
    ).toEqual([1000n, true, 999_000n]);
  });
  it("stops when a round spends nothing (budget below step)", () => {
    const r = allocateRewards({ ...policy, budget: 999n }, [{ id: "a", total: 9000n, approved: true }]);
    expect(r.ok && r.value.unallocated).toBe(999n);
  });
});

describe("salary", () => {
  const band = { id: "b", min: 5_000_000n, max: 7_000_000n, approved: true };
  it("says when no band is configured — never invents a number", () =>
    expect(recommendSalary({ band: null, total: 8000n, levelMin: 7000n, nextLevelMin: 8500n })).toEqual({
      ok: true,
      value: { status: "NO_BAND" },
    }));
  it("rejects inconsistent input", () => {
    for (const bad of [
      { band: { ...band, max: 1n } },
      { band: { ...band, min: -1n } },
      { nextLevelMin: 7000n },
      { step: 0n },
      { spreadBp: -1n },
    ])
      expect(recommendSalary({ band, total: 8000n, levelMin: 7000n, nextLevelMin: 8500n, ...bad }).ok).toBe(
        false,
      );
  });
  it("measures progress to 100.00 at the top level and clamps to the band", () => {
    const r = recommendSalary({ band, total: 10000n, levelMin: 9200n, nextLevelMin: null });
    expect(r.ok && r.value).toMatchObject({ point: 7_000_000n, low: 6_800_000n, high: 7_000_000n });
    const low = recommendSalary({
      band: { ...band, min: 0n, max: 100_000n },
      total: 0n,
      levelMin: 7000n,
      nextLevelMin: 8500n,
      spreadBp: 5000n,
    });
    expect(low.ok && low.value).toMatchObject({ point: 0n, low: 0n, high: 50_000n });
  });
});

describe("workflow", () => {
  it("allows only listed transitions", () => {
    expect(canTransition("assessment", "UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("assessment", "APPROVED", "UNDER_REVIEW")).toBe(false);
    expect(canTransition("reward", "PAID", "CANCELLED")).toBe(false);
    expect(transition("reward", "PROPOSED", "PAID")).toMatchObject({
      ok: false,
      error: { code: "workflow.invalidTransition" },
    });
  });
  it("requires a reason for rejections and cancellations", () => {
    expect(transition("evidence", "SUBMITTED", "REJECTED")).toMatchObject({
      ok: false,
      error: { code: "workflow.reasonRequired" },
    });
    expect(transition("evidence", "SUBMITTED", "REJECTED", "  ")).toMatchObject({ ok: false });
    expect(transition("evidence", "SUBMITTED", "REJECTED", "Duplicate of S-101")).toEqual({
      ok: true,
      value: "REJECTED",
    });
    expect(transition("evidence", "SUBMITTED", "VERIFIED")).toEqual({ ok: true, value: "VERIFIED" });
  });
  it("treats an unknown stored state (e.g. corrupted row) as having no transitions", () => {
    expect(canTransition("reward", "GHOST" as never, "PAID")).toBe(false);
    expect(isTerminal("reward", "GHOST" as never)).toBe(true);
  });
  it("knows terminal states", () => {
    expect(isTerminal("reward", "PAID")).toBe(true);
    expect(isTerminal("assessment", "APPROVED")).toBe(false);
    expect(isTerminal("appeal", "ACCEPTED")).toBe(true);
    expect(isTerminal("promotion", "APPROVED") && isTerminal("compensation", "REJECTED")).toBe(true);
  });
});

describe("authz", () => {
  const admin: Actor = { userId: "u-admin", grants: grantsFor(DEFAULT_ROLES.admin) };
  const manager: Actor = {
    userId: "u-mgr",
    employeeId: "e-mgr",
    grants: grantsFor(DEFAULT_ROLES.manager, "/hq/branch-1/"),
  };
  const employee: Actor = { userId: "u-emp", employeeId: "e-1", grants: grantsFor(DEFAULT_ROLES.employee) };
  const inBranch = { orgUnitPath: "/hq/branch-1/team-a/", ownerEmployeeId: "e-1" };
  const otherBranch = { orgUnitPath: "/hq/branch-2/", ownerEmployeeId: "e-2" };

  it("admin has every permission except self-service submit/appeal", () => {
    expect(PERMISSIONS.filter((p) => can(admin, p, otherBranch))).toHaveLength(PERMISSIONS.length - 2);
    expect(can(admin, "evidence:submit", inBranch)).toBe(false);
  });
  it("manager is limited to the org-unit subtree", () => {
    expect(can(manager, "evidence:verify", inBranch)).toBe(true);
    expect(can(manager, "evidence:verify", otherBranch)).toBe(false);
    expect(can(manager, "evidence:verify", {})).toBe(false);
    expect(can(manager, "compensation:read", inBranch)).toBe(false);
    expect(can(manager, "reward:approve", inBranch)).toBe(false);
  });
  it("employee sees only own records", () => {
    expect(can(employee, "compensation:read", inBranch)).toBe(true);
    expect(can(employee, "compensation:read", otherBranch)).toBe(false);
    expect(can(employee, "evidence:verify", inBranch)).toBe(false);
    expect(can({ userId: "x", grants: grantsFor(DEFAULT_ROLES.employee) }, "employee:read", inBranch)).toBe(
      false,
    );
  });
  it("ORG_UNIT grant without a path never matches", () =>
    expect(
      can(
        { userId: "x", grants: [{ permission: "evidence:verify", scope: "ORG_UNIT" }] },
        "evidence:verify",
        inBranch,
      ),
    ).toBe(false));
  it("ORG_UNIT role assigned without a unit stays unscoped (and therefore matches nothing)", () =>
    expect(grantsFor(DEFAULT_ROLES.manager).every((g) => g.orgUnitPath === undefined)).toBe(true));
  it("enforces separation of duties", () => {
    expect(separationOfDuties(manager, { subjectUserId: "u-mgr", proposerUserId: "u-mgr" })).toEqual([
      "sod.self",
      "sod.ownProposal",
    ]);
    expect(separationOfDuties(manager, { subjectUserId: "u-emp", proposerUserId: "u-other" })).toEqual([]);
    expect(separationOfDuties(manager, {})).toEqual([]);
  });
});
