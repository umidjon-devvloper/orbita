// Proves every rule in prisma/migrations/*_constraints is enforced by Postgres itself,
// independently of application code. Each test runs in a rolled-back transaction.
import { describe, expect, it } from "vitest";
import { inRollback, performanceAssessment, seedWorld, type Db, type World } from "./test-db.js";

const uz = (text: string) => ({ uz: text });
const t = (name: string, fn: (db: Db, w: World) => Promise<void>) =>
  it(name, () => inRollback(async (db) => fn(db, await seedWorld(db))));

describe("ranges and required content", () => {
  t("rejects weights, gate minimums and scores outside 0–100", async (db, w) => {
    const draft = await db.insert("RubricVersion", {
      rubricId: w.rubricId,
      version: 2,
      createdById: w.userId,
    });
    const base = { rubricVersionId: draft, name: uz("x"), method: "MANUAL" };
    expect(await db.rejectsInsert("RubricCriterion", { ...base, key: "a", weightBp: 10001 })).toMatch(
      /weight_range/,
    );
    expect(
      await db.rejectsInsert("RubricCriterion", { ...base, key: "b", weightBp: 1, isGate: true }),
    ).toMatch(/gate_min/);
    expect(
      await db.rejectsInsert("RubricCriterion", { ...base, key: "c", weightBp: 1, minEvidenceCount: 2 }),
    ).toMatch(/min_evidence/);
    const a = await performanceAssessment(db, w);
    expect(
      await db.rejectsInsert("CriterionResult", {
        assessmentId: a,
        criterionId: w.criterionId,
        humanScore: 10001,
      }),
    ).toMatch(/score_range/);
    expect(await db.rejects(`UPDATE "Assessment" SET "totalScore" = -1 WHERE id = $1`, [a])).toMatch(
      /total_range/,
    );
  });

  t("requires an Uzbek name on configuration entities", async (db, w) => {
    expect(
      await db.rejectsInsert("Specialty", {
        orgId: w.orgId,
        key: "x",
        name: { ru: "Только русский" },
        updatedAt: w.now,
      }),
    ).toMatch(/name_uz/);
    expect(
      await db.rejectsInsert("Position", {
        specialtyId: w.specialtyId,
        key: "x",
        title: { en: "Only English" },
      }),
    ).toMatch(/title_uz/);
    expect(await db.rejectsInsert("Competency", { orgId: w.orgId, key: "x", name: { uz: 5 } })).toMatch(
      /name_uz/,
    );
  });

  t("compares emails case-insensitively (citext)", async (db, w) => {
    expect(
      await db.rejectsInsert("User", { orgId: w.orgId, email: "manager@example.UZ", updatedAt: w.now }),
    ).toMatch(/unique/i);
  });
});

describe("assessment subjects", () => {
  t("a performance assessment needs an employee and a period, never a candidate", async (db, w) => {
    const row = { orgId: w.orgId, kind: "PERFORMANCE", rubricVersionId: w.versionId, updatedAt: w.now };
    expect(await db.rejectsInsert("Assessment", { ...row, employeeId: w.employeeId })).toMatch(
      /subject_by_kind/,
    );
    const candidateId = await db.insert("Candidate", {
      orgId: w.orgId,
      positionId: w.positionId,
      pseudonym: "CAN-1",
      updatedAt: w.now,
    });
    expect(
      await db.rejectsInsert("Assessment", { ...row, kind: "CANDIDATE", candidateId, periodId: w.periodId }),
    ).toMatch(/subject_by_kind/);
  });

  t("only one live performance assessment per employee, period and rubric version", async (db, w) => {
    await performanceAssessment(db, w);
    expect(
      await db.rejects(
        `INSERT INTO "Assessment" (id, "orgId", kind, "rubricVersionId", "employeeId", "periodId", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'PERFORMANCE', $2, $3, $4, now())`,
        [w.orgId, w.versionId, w.employeeId, w.periodId],
      ),
    ).toMatch(/one_live_performance/);
  });

  t("only one ACTIVE rubric version per rubric", async (db, w) => {
    expect(
      await db.rejectsInsert("RubricVersion", {
        rubricId: w.rubricId,
        version: 2,
        status: "ACTIVE",
        createdById: w.userId,
      }),
    ).toMatch(/one_active/);
  });
});

describe("rubric versions lock on first use", () => {
  t("inserting an assessment locks the version; criteria become immutable", async (db, w) => {
    await db.exec(`UPDATE "RubricCriterion" SET "weightBp" = 9000 WHERE id = $1`, [w.criterionId]); // still a draft-in-use? not yet used → allowed
    await db.exec(`UPDATE "RubricCriterion" SET "weightBp" = 10000 WHERE id = $1`, [w.criterionId]);
    await performanceAssessment(db, w);
    const locked = await db.exec(`SELECT "isLocked" FROM "RubricVersion" WHERE id = $1`, [w.versionId]);
    expect(locked.rows[0]).toEqual({ isLocked: true });
    expect(
      await db.rejects(`UPDATE "RubricCriterion" SET "weightBp" = 5000 WHERE id = $1`, [w.criterionId]),
    ).toMatch(/orbita:rubric.versionLocked/);
    expect(await db.rejects(`DELETE FROM "RubricCriterion" WHERE id = $1`, [w.criterionId])).toMatch(
      /orbita:rubric.versionLocked/,
    );
    expect(
      await db.rejects(
        `INSERT INTO "RubricCriterion" (id, "rubricVersionId", key, name, "weightBp", method) VALUES (gen_random_uuid(), $1, 'new', '{"uz":"y"}', 0, 'MANUAL')`,
        [w.versionId],
      ),
    ).toMatch(/orbita:rubric.versionLocked/);
    expect(
      await db.rejects(`UPDATE "RubricVersion" SET "isLocked" = false WHERE id = $1`, [w.versionId]),
    ).toMatch(/orbita:rubric.versionLocked/);
    expect(
      await db.rejects(`UPDATE "RubricVersion" SET "allowRenormalization" = true WHERE id = $1`, [
        w.versionId,
      ]),
    ).toMatch(/orbita:rubric.versionLocked/);
    // retiring a locked version is allowed
    await db.exec(`UPDATE "RubricVersion" SET status = 'RETIRED' WHERE id = $1`, [w.versionId]);
  });
});

describe("approved assessments are frozen", () => {
  t("results, totals and allocations cannot change after approval", async (db, w) => {
    const a = await performanceAssessment(db, w, "UNDER_REVIEW");
    await db.insert("CriterionResult", {
      assessmentId: a,
      criterionId: w.criterionId,
      humanScore: 8000,
      finalScore: 8000,
    });
    await db.exec(
      `UPDATE "Assessment" SET status = 'APPROVED', "totalScore" = 8000, "approvedById" = $2, "approvedAt" = now() WHERE id = $1`,
      [a, w.userId],
    );
    expect(
      await db.rejects(`UPDATE "CriterionResult" SET "finalScore" = 9000 WHERE "assessmentId" = $1`, [a]),
    ).toMatch(/orbita:assessment.finalized/);
    expect(await db.rejects(`UPDATE "Assessment" SET "totalScore" = 9000 WHERE id = $1`, [a])).toMatch(
      /orbita:assessment.finalized/,
    );
    expect(await db.rejects(`DELETE FROM "Assessment" WHERE id = $1`, [a])).toMatch(
      /orbita:assessment.finalized/,
    );
    // status may still move along the workflow (appeal)
    await db.exec(`UPDATE "Assessment" SET status = 'APPEALED' WHERE id = $1`, [a]);
  });
});

describe("evidence", () => {
  t("imported evidence needs an external id and is deduplicated", async (db, w) => {
    const row = {
      orgId: w.orgId,
      employeeId: w.employeeId,
      periodId: w.periodId,
      type: "SALE",
      title: "Sale",
      occurredOn: "2026-09-10",
      updatedAt: w.now,
    };
    expect(await db.rejectsInsert("Evidence", { ...row, source: "CSV_IMPORT" })).toMatch(
      /external_id_required/,
    );
    expect(await db.rejectsInsert("Evidence", { ...row, source: "CRM", externalId: "  " })).toMatch(
      /external_id_required/,
    );
    await db.insert("Evidence", { ...row, source: "CRM", externalId: "R-1" });
    expect(await db.rejectsInsert("Evidence", { ...row, source: "CRM", externalId: "R-1" })).toMatch(
      /unique/i,
    );
    await db.insert("Evidence", { ...row, source: "CSV_IMPORT", externalId: "R-1" }); // different source is a different record
    await db.insert("Evidence", { ...row }); // manual evidence needs no external id
  });

  t("fees are non-negative and CSAT is 1–5", async (db, w) => {
    const row = {
      orgId: w.orgId,
      employeeId: w.employeeId,
      periodId: w.periodId,
      title: "x",
      occurredOn: "2026-09-10",
      updatedAt: w.now,
    };
    expect(await db.rejectsInsert("Evidence", { ...row, type: "SALE", serviceFee: -1 })).toMatch(
      /fees_nonneg/,
    );
    expect(
      await db.rejectsInsert("Evidence", { ...row, type: "CUSTOMER_FEEDBACK", metrics: { csat: 6 } }),
    ).toMatch(/csat_range/);
    expect(
      await db.rejectsInsert("Evidence", { ...row, type: "CUSTOMER_FEEDBACK", metrics: { csat: null } }),
    ).toMatch(/csat_range/);
    expect(
      await db.rejectsInsert("Evidence", { ...row, type: "CUSTOMER_FEEDBACK", metrics: { csat: 4.5 } }),
    ).toMatch(/csat_range/);
    await db.insert("Evidence", { ...row, type: "CUSTOMER_FEEDBACK", metrics: { csat: 5 } });
  });

  t("record evidence cannot be allocated; contributions count once per period", async (db, w) => {
    const a = await performanceAssessment(db, w);
    const row = {
      orgId: w.orgId,
      employeeId: w.employeeId,
      periodId: w.periodId,
      title: "x",
      occurredOn: "2026-09-10",
      updatedAt: w.now,
    };
    const sale = await db.insert("Evidence", { ...row, type: "SALE" });
    const mentoring = await db.insert("Evidence", { ...row, type: "MENTORING" });
    const alloc = { periodId: w.periodId, assessmentId: a, criterionId: w.criterionId };
    expect(await db.rejectsInsert("EvidenceAllocation", { ...alloc, evidenceId: sale })).toMatch(
      /orbita:allocation.recordTypeNotAllocatable/,
    );
    await db.insert("EvidenceAllocation", { ...alloc, evidenceId: mentoring });
    expect(await db.rejectsInsert("EvidenceAllocation", { ...alloc, evidenceId: mentoring })).toMatch(
      /unique/i,
    );
  });

  t("allocation period must match the evidence and the assessment", async (db, w) => {
    const a = await performanceAssessment(db, w);
    const other = await db.insert("PerformancePeriod", {
      orgId: w.orgId,
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    const ev = await db.insert("Evidence", {
      orgId: w.orgId,
      employeeId: w.employeeId,
      periodId: w.periodId,
      type: "TRAINING",
      title: "x",
      occurredOn: "2026-09-10",
      updatedAt: w.now,
    });
    expect(
      await db.rejectsInsert("EvidenceAllocation", {
        evidenceId: ev,
        periodId: other,
        assessmentId: a,
        criterionId: w.criterionId,
      }),
    ).toMatch(/orbita:allocation.periodMismatch/);
  });
});

describe("money and dates", () => {
  t("salary bands: min ≤ max and no overlapping effective ranges", async (db, w) => {
    const band = { positionId: w.positionId, levelId: w.levelId };
    expect(
      await db.rejectsInsert("SalaryBand", {
        ...band,
        minAmount: 7_000_000,
        maxAmount: 5_000_000,
        effectiveFrom: "2026-01-01",
      }),
    ).toMatch(/SalaryBand_order/);
    await db.insert("SalaryBand", {
      ...band,
      minAmount: 5_000_000,
      maxAmount: 7_000_000,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-07-01",
    });
    expect(
      await db.rejectsInsert("SalaryBand", {
        ...band,
        minAmount: 5_000_000,
        maxAmount: 8_000_000,
        effectiveFrom: "2026-06-01",
      }),
    ).toMatch(/no_overlap/);
    await db.insert("SalaryBand", {
      ...band,
      minAmount: 5_500_000,
      maxAmount: 7_500_000,
      effectiveFrom: "2026-07-01",
    }); // adjacent is fine
  });

  t("performance periods do not overlap", async (db, w) => {
    expect(
      await db.rejectsInsert("PerformancePeriod", {
        orgId: w.orgId,
        startsOn: "2026-09-15",
        endsOn: "2026-10-14",
      }),
    ).toMatch(/no_overlap/);
    expect(
      await db.rejectsInsert("PerformancePeriod", {
        orgId: w.orgId,
        startsOn: "2026-11-30",
        endsOn: "2026-11-01",
      }),
    ).toMatch(/PerformancePeriod_dates/);
  });

  t(
    "rewards: one per employee, period and policy; cash needs an amount; PAID needs who and when",
    async (db, w) => {
      const a = await performanceAssessment(db, w);
      const policyId = await db.insert("RewardPolicy", {
        orgId: w.orgId,
        specialtyId: w.specialtyId,
        rubricVersionId: w.versionId,
        name: uz("Oylik mukofot"),
        config: {},
      });
      const row = {
        policyId,
        periodId: w.periodId,
        employeeId: w.employeeId,
        assessmentId: a,
        explanation: {},
      };
      expect(await db.rejectsInsert("RewardRecommendation", { ...row, kind: "CASH" })).toMatch(
        /RewardRecommendation_amount/,
      );
      expect(
        await db.rejectsInsert("RewardRecommendation", {
          ...row,
          kind: "CASH",
          amount: 1000,
          status: "PAID",
        }),
      ).toMatch(/paid_fields/);
      await db.insert("RewardRecommendation", { ...row, kind: "CASH", amount: 1_600_000 });
      expect(
        await db.rejectsInsert("RewardRecommendation", { ...row, kind: "CASH", amount: 1_600_000 }),
      ).toMatch(/unique/i);
    },
  );
});

describe("audit log", () => {
  t("is append-only for every role", async (db, w) => {
    const e = await db.insert("AuditEvent", {
      orgId: w.orgId,
      actorId: w.userId,
      action: "assessment.approved",
      entityType: "Assessment",
      entityId: "x",
    });
    expect(await db.rejects(`UPDATE "AuditEvent" SET action = 'tampered' WHERE id = $1`, [e])).toMatch(
      /orbita:audit.appendOnly/,
    );
    expect(await db.rejects(`DELETE FROM "AuditEvent" WHERE id = $1`, [e])).toMatch(
      /orbita:audit.appendOnly/,
    );
    expect(await db.rejects(`TRUNCATE "AuditEvent"`)).toMatch(/orbita:audit.appendOnly/);
  });
});
