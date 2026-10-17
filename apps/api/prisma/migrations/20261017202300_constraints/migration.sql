-- Orbita — constraints Prisma cannot express (docs/DATABASE_DESIGN.md §4).
-- Hand-written. Every rule here is covered by src/db/constraints.db.test.ts.
-- Error messages use stable codes ("orbita:<code>") so the API can map them to i18n keys.
-- NOTE: a CHECK passes when its expression is NULL — nullable expressions are wrapped in "IS TRUE".

-- ───────────────────────── Ranges ─────────────────────────
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_weight_range"
  CHECK ("weightBp" BETWEEN 0 AND 10000);
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_gate_min"
  CHECK (NOT "isGate" OR ("gateMinScore" BETWEEN 0 AND 10000) IS TRUE);
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_min_evidence"
  CHECK ("minEvidenceCount" >= 0 AND ("evidenceRequired" OR "minEvidenceCount" = 0));
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_score_range" CHECK (
  ("computedScore"    IS NULL OR "computedScore"    BETWEEN 0 AND 10000) AND
  ("aiSuggestedScore" IS NULL OR "aiSuggestedScore" BETWEEN 0 AND 10000) AND
  ("humanScore"       IS NULL OR "humanScore"       BETWEEN 0 AND 10000) AND
  ("finalScore"       IS NULL OR "finalScore"       BETWEEN 0 AND 10000));
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_total_range"
  CHECK ("totalScore" IS NULL OR "totalScore" BETWEEN 0 AND 10000);
ALTER TABLE "LevelRequirement" ADD CONSTRAINT "LevelRequirement_min_range"
  CHECK ("minScore" BETWEEN 0 AND 10000);
ALTER TABLE "CareerLevel" ADD CONSTRAINT "CareerLevel_min_total_range"
  CHECK ("minTotalScore" IS NULL OR "minTotalScore" BETWEEN 0 AND 10000);
ALTER TABLE "RubricVersion" ADD CONSTRAINT "RubricVersion_pass_range"
  CHECK ("passThreshold" IS NULL OR "passThreshold" BETWEEN 0 AND 10000);
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_importance"
  CHECK ("importance" BETWEEN 1 AND 3);
ALTER TABLE "DevelopmentItem" ADD CONSTRAINT "DevelopmentItem_target_range"
  CHECK ("targetScore" IS NULL OR "targetScore" BETWEEN 0 AND 10000);

-- Localized config names must carry Uzbek (default language)
ALTER TABLE "Specialty"   ADD CONSTRAINT "Specialty_name_uz"   CHECK ((jsonb_typeof("name"->'uz') = 'string') IS TRUE);
ALTER TABLE "Competency"  ADD CONSTRAINT "Competency_name_uz"  CHECK ((jsonb_typeof("name"->'uz') = 'string') IS TRUE);
ALTER TABLE "CareerLevel" ADD CONSTRAINT "CareerLevel_name_uz" CHECK ((jsonb_typeof("name"->'uz') = 'string') IS TRUE);
ALTER TABLE "Position"    ADD CONSTRAINT "Position_title_uz"   CHECK ((jsonb_typeof("title"->'uz') = 'string') IS TRUE);

-- ───────────────────── Subjects by kind ─────────────────────
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subject_by_kind" CHECK (
  ("kind" = 'CANDIDATE'    AND "candidateId" IS NOT NULL AND "employeeId" IS NULL AND "periodId" IS NULL) OR
  ("kind" = 'PERFORMANCE'  AND "employeeId" IS NOT NULL AND "candidateId" IS NULL AND "periodId" IS NOT NULL) OR
  ("kind" = 'LEVEL_REVIEW' AND "employeeId" IS NOT NULL AND "candidateId" IS NULL));

ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_subject" CHECK (
  ("subject" = 'CANDIDATE' AND "candidateId" IS NOT NULL AND "employeeId" IS NULL) OR
  ("subject" = 'EMPLOYEE'  AND "employeeId"  IS NOT NULL AND "candidateId" IS NULL));

-- ───────────────────────── Uniqueness ─────────────────────────
-- One live performance assessment per employee + period + rubric version (reassessments supersede)
CREATE UNIQUE INDEX "Assessment_one_live_performance" ON "Assessment" ("employeeId", "periodId", "rubricVersionId")
  WHERE "kind" = 'PERFORMANCE' AND "status" NOT IN ('REJECTED', 'REASSESSED');
-- Only one ACTIVE version per rubric
CREATE UNIQUE INDEX "RubricVersion_one_active" ON "RubricVersion" ("rubricId") WHERE "status" = 'ACTIVE';
-- Active level ranks unique per organization
CREATE UNIQUE INDEX "CareerLevel_active_rank" ON "CareerLevel" ("orgId", "rank") WHERE "isActive";
-- Org-unit subtree lookups (path LIKE '/a/b/%')
CREATE INDEX "OrgUnit_path_prefix" ON "OrgUnit" ("orgId", "path" text_pattern_ops);

-- ───────────────────────── Money ─────────────────────────
ALTER TABLE "SalaryBand" ADD CONSTRAINT "SalaryBand_order" CHECK ("minAmount" >= 0 AND "minAmount" <= "maxAmount");
ALTER TABLE "SalaryBand" ADD CONSTRAINT "SalaryBand_dates" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "SalaryBand" ADD CONSTRAINT "SalaryBand_no_overlap" EXCLUDE USING gist (
  "positionId" WITH =, "levelId" WITH =,
  daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[)') WITH &&);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_fees_nonneg"
  CHECK (COALESCE("serviceFee", 0) >= 0 AND COALESCE("governmentFee", 0) >= 0);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_external_id_required"
  CHECK ("source" = 'MANUAL' OR ("externalId" IS NOT NULL AND btrim("externalId") <> ''));
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_csat_range"
  CHECK ("metrics" IS NULL OR NOT ("metrics" ? 'csat') OR (jsonb_typeof("metrics"->'csat') = 'number' AND ("metrics"->>'csat')::numeric IN (1, 2, 3, 4, 5)));
ALTER TABLE "RewardBudget" ADD CONSTRAINT "RewardBudget_nonneg" CHECK ("amount" >= 0);
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_amount" CHECK (
  ("kind" = 'CASH' AND "amount" IS NOT NULL AND "amount" >= 0) OR ("kind" = 'RECOGNITION' AND "amount" IS NULL));
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT "RewardRecommendation_paid_fields"
  CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL AND "paidMarkedById" IS NOT NULL));
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT "CompensationRecommendation_range"
  CHECK (("rangeMin" IS NULL) = ("rangeMax" IS NULL) AND ("rangeMin" IS NULL OR (0 <= "rangeMin" AND "rangeMin" <= "rangeMax")));

-- ───────────────────────── Periods ─────────────────────────
ALTER TABLE "PerformancePeriod" ADD CONSTRAINT "PerformancePeriod_dates" CHECK ("endsOn" >= "startsOn");
ALTER TABLE "PerformancePeriod" ADD CONSTRAINT "PerformancePeriod_no_overlap" EXCLUDE USING gist (
  "orgId" WITH =, daterange("startsOn", "endsOn", '[]') WITH &&);

-- ─────────────── Rubric versions: lock on first use, then immutable ───────────────
CREATE FUNCTION orbita_lock_rubric_on_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "RubricVersion" SET "isLocked" = true WHERE id = NEW."rubricVersionId" AND NOT "isLocked";
  RETURN NEW;
END $$;
CREATE TRIGGER "Assessment_locks_rubric" AFTER INSERT ON "Assessment"
  FOR EACH ROW EXECUTE FUNCTION orbita_lock_rubric_on_use();

CREATE FUNCTION orbita_forbid_locked_rubric_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid := COALESCE(NEW."rubricVersionId", OLD."rubricVersionId");
BEGIN
  IF EXISTS (SELECT 1 FROM "RubricVersion" WHERE id = v AND "isLocked") THEN
    RAISE EXCEPTION 'orbita:rubric.versionLocked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER "RubricCriterion_locked" BEFORE INSERT OR UPDATE OR DELETE ON "RubricCriterion"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_locked_rubric_child();
CREATE TRIGGER "AssessmentQuestion_locked" BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentQuestion"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_locked_rubric_child();

-- A locked version may only change status (ACTIVE ↔ RETIRED, activatedAt); it can never unlock.
CREATE FUNCTION orbita_forbid_locked_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isLocked" THEN RAISE EXCEPTION 'orbita:rubric.versionLocked' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."isLocked" AND (
       NOT NEW."isLocked"
    OR NEW."rubricId" <> OLD."rubricId" OR NEW.version <> OLD.version
    OR NEW."allowRenormalization" <> OLD."allowRenormalization"
    OR NEW."passThreshold" IS DISTINCT FROM OLD."passThreshold"
    OR NEW."createdById" <> OLD."createdById" OR NEW."createdAt" <> OLD."createdAt") THEN
    RAISE EXCEPTION 'orbita:rubric.versionLocked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RubricVersion_locked" BEFORE UPDATE OR DELETE ON "RubricVersion"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_locked_version_change();

-- ─────────────── Approved assessments: results and totals frozen ───────────────
CREATE FUNCTION orbita_is_final(s "AssessmentStatus") RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT s IN ('APPROVED', 'REJECTED', 'APPEALED', 'REASSESSED')
$$;

CREATE FUNCTION orbita_forbid_final_result_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid := COALESCE(NEW."assessmentId", OLD."assessmentId");
BEGIN
  IF EXISTS (SELECT 1 FROM "Assessment" WHERE id = a AND orbita_is_final(status)) THEN
    RAISE EXCEPTION 'orbita:assessment.finalized' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER "CriterionResult_final" BEFORE INSERT OR UPDATE OR DELETE ON "CriterionResult"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_final_result_change();
CREATE TRIGGER "EvidenceAllocation_final" BEFORE INSERT OR UPDATE OR DELETE ON "EvidenceAllocation"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_final_result_change();

CREATE FUNCTION orbita_forbid_final_assessment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF orbita_is_final(OLD.status) THEN RAISE EXCEPTION 'orbita:assessment.finalized' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF orbita_is_final(OLD.status) AND (
       NEW."totalScore" IS DISTINCT FROM OLD."totalScore"
    OR NEW."calcSnapshot" IS DISTINCT FROM OLD."calcSnapshot"
    OR NEW."calcVersion" IS DISTINCT FROM OLD."calcVersion"
    OR NEW."rubricVersionId" <> OLD."rubricVersionId"
    OR NEW."employeeId" IS DISTINCT FROM OLD."employeeId"
    OR NEW."candidateId" IS DISTINCT FROM OLD."candidateId"
    OR NEW."periodId" IS DISTINCT FROM OLD."periodId"
    OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
    OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") THEN
    RAISE EXCEPTION 'orbita:assessment.finalized' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Assessment_final" BEFORE UPDATE OR DELETE ON "Assessment"
  FOR EACH ROW EXECUTE FUNCTION orbita_forbid_final_assessment_change();

-- ─────────────── Evidence allocation: contributions only, same period ───────────────
CREATE FUNCTION orbita_check_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "Evidence"%ROWTYPE; a_period uuid;
BEGIN
  SELECT * INTO e FROM "Evidence" WHERE id = NEW."evidenceId";
  IF e.type IN ('SERVICE_RECORD', 'SALE', 'CUSTOMER_FEEDBACK') THEN
    RAISE EXCEPTION 'orbita:allocation.recordTypeNotAllocatable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "periodId" INTO a_period FROM "Assessment" WHERE id = NEW."assessmentId";
  IF NEW."periodId" <> e."periodId" OR a_period IS DISTINCT FROM NEW."periodId" THEN
    RAISE EXCEPTION 'orbita:allocation.periodMismatch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "EvidenceAllocation_check" BEFORE INSERT OR UPDATE ON "EvidenceAllocation"
  FOR EACH ROW EXECUTE FUNCTION orbita_check_allocation();

-- ───────────────────── Audit log: append-only ─────────────────────
-- Enforced for every role (including the owner). Retention deletes run as a superuser maintenance job
-- that disables this trigger inside its own transaction.
CREATE FUNCTION orbita_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'orbita:audit.appendOnly' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION orbita_audit_append_only();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION orbita_audit_append_only();
