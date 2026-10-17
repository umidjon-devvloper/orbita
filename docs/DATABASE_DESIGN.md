# Database Design — Orbita

Status: Draft for review · Phase 1
Source of truth for the model: [`schema.draft.prisma`](./schema.draft.prisma) — 46 models, 32 enums, validated with Prisma's schema validator (7.x and 8.x). It moves to `apps/api/prisma/schema.prisma` in Phase 2.

## 1. Conventions

| Topic | Rule |
|---|---|
| IDs | UUIDv7 (`@default(uuid(7))`, `uuid` column) — sortable by time, safe to expose |
| Tenancy | Every root entity has `orgId`; all queries filter by the user's org. Single-org deployment in MVP, multi-org-ready. |
| Scores | **Integer hundredths** `0–10000` (`74.90` → `7490`). Exact integer math, no `Decimal` arithmetic in JS. Displayed with 2 decimals. |
| Weights | Integer basis points; active criteria of a rubric version sum to `10000`. |
| Money | `BIGINT` whole UZS. JSON transport as strings. Currency column kept for future multi-currency (`UZS` only in MVP). |
| Dates | `timestamptz` for events; `date` for business dates (periods, hire date, evidence date) interpreted in `Asia/Tashkent`. |
| Localized config text | `Json` `{ "uz": "...", "ru": "...", "en": "..." }`, `uz` required; fallback chain `requested → uz`. User-generated content (feedback, evidence text) is plain `text` and never translated. |
| Demo data | `isDemo` on every seedable table; `db:seed:clear-demo` deletes by flag; UI banner when any demo row exists. |
| Approval of illustrative config | `approval = UNAPPROVED` on levels, salary bands, reward policies until the owner approves. UI shows a badge. |
| Soft delete | Not used. Config entities are deactivated with `isActive=false`; history entities are never deleted (retention job anonymizes). |

> **Decision (deviation from v2 prompt):** v2 said "Decimal(5,2)" for scores. Integer hundredths give the same precision with simpler, exact arithmetic in TypeScript and identical values in SQL. Logged in DECISIONS.md D-07.

## 2. Domain map

```mermaid
erDiagram
  Organization ||--o{ OrgUnit : has
  Organization ||--o{ User : has
  User ||--o| Employee : "is (optional)"
  OrgUnit ||--o{ Employee : contains
  Specialty ||--o{ Position : has
  Specialty ||--o{ Rubric : "has (one per purpose)"
  Rubric ||--o{ RubricVersion : versions
  RubricVersion ||--o{ RubricCriterion : criteria
  RubricVersion ||--o{ AssessmentQuestion : questions
  RubricCriterion }o--o| Competency : measures
  CareerLevel ||--o{ LevelRequirement : requires
  LevelRequirement }o--|| Competency : on
  Position ||--o{ SalaryBand : "per level"
  CareerLevel ||--o{ SalaryBand : ""
  Employee }o--|| Position : holds
  Employee }o--o| CareerLevel : "current level"
  Employee ||--o{ CareerLevelHistory : history
  Employee ||--o{ Evidence : submits
  PerformancePeriod ||--o{ Evidence : "occurs in"
  Assessment }o--|| RubricVersion : "scored by"
  Assessment }o--o| Employee : "subject (performance/level)"
  Assessment }o--o| Candidate : "subject (candidate)"
  Assessment }o--o| PerformancePeriod : "for period"
  Assessment ||--o{ CriterionResult : results
  Assessment ||--o| AssessmentInvite : "candidate link"
  Assessment ||--o{ CandidateResponse : answers
  Evidence ||--o{ EvidenceAllocation : "allocated (max 1 per period)"
  EvidenceAllocation }o--|| RubricCriterion : to
  Assessment ||--o{ Appeal : appealed
  Employee ||--o{ PromotionRecommendation : ""
  Candidate ||--o{ HiringDecision : ""
  RewardPolicy ||--o{ RewardBudget : "per period"
  RewardPolicy ||--o{ RewardRecommendation : produces
  RewardRecommendation }o--|| Assessment : "based on"
  CrmConnection ||--o{ ExternalMapping : maps
```

## 3. Tables by module

| Module | Tables | Notes |
|---|---|---|
| Identity | Organization, OrgUnit, User, Role, RolePermission, RoleAssignment, Session, PasswordResetToken | OrgUnit uses materialized `path` for subtree scope checks (`path LIKE '/root/unit/%'`). |
| Catalog | Specialty, Position, Competency, PositionCompetency | Competencies are org-wide and reused across specialties. |
| Framework | CareerLevel, LevelRequirement, SalaryBand | Requirements are per (level, specialty, competency); `isGate` marks must-pass. |
| Rubrics | Rubric, RubricVersion, RubricCriterion, AssessmentQuestion | One rubric per (specialty, purpose); versions immutable once locked. |
| People | Employee, Candidate | Both carry a stable `pseudonym` used for AI and exports. |
| Assessment | PerformancePeriod, Assessment, AssessmentInvite, CandidateResponse, CriterionResult | One `Assessment` table for three kinds; subject columns validated by CHECK. |
| Evidence | Evidence, EvidenceAttachment, EvidenceAllocation | Learning and mentoring are evidence types, not separate tables (one concept: verifiable activity). |
| Decisions | Appeal, PromotionRecommendation, CareerLevelHistory, HiringDecision, CompensationRecommendation, DevelopmentItem | Each decision row stores who, when, and the domain snapshot it was based on. |
| Rewards | RewardPolicy, RewardBudget, RewardRecommendation | Policy tied to specialty + rubric version = the comparison cohort. |
| Platform | Notification, AuditEvent, AiRun, ReferenceDocument | AuditEvent append-only. |
| Integration | CrmConnection, ExternalMapping, ImportBatch, Job | Credentials never stored in DB. |

## 4. Constraints Prisma cannot express (raw SQL in migrations)

Written in `apps/api/prisma/migrations/*_constraints/migration.sql` right after the generated migration.

```sql
CREATE EXTENSION IF NOT EXISTS citext;

-- Scores and weights in range
ALTER TABLE "RubricCriterion"  ADD CONSTRAINT weight_range   CHECK ("weightBp" BETWEEN 0 AND 10000);
ALTER TABLE "RubricCriterion"  ADD CONSTRAINT gate_needs_min CHECK (NOT "isGate" OR "gateMinScore" BETWEEN 0 AND 10000);
ALTER TABLE "CriterionResult"  ADD CONSTRAINT score_range    CHECK (
  coalesce("computedScore",0)    BETWEEN 0 AND 10000 AND coalesce("aiSuggestedScore",0) BETWEEN 0 AND 10000 AND
  coalesce("humanScore",0)       BETWEEN 0 AND 10000 AND coalesce("finalScore",0)       BETWEEN 0 AND 10000);
ALTER TABLE "Assessment"       ADD CONSTRAINT total_range    CHECK ("totalScore" IS NULL OR "totalScore" BETWEEN 0 AND 10000);
ALTER TABLE "LevelRequirement" ADD CONSTRAINT min_range      CHECK ("minScore" BETWEEN 0 AND 10000);

-- Assessment subject matches kind
ALTER TABLE "Assessment" ADD CONSTRAINT subject_by_kind CHECK (
  ("kind" = 'CANDIDATE'    AND "candidateId" IS NOT NULL AND "employeeId" IS NULL AND "periodId" IS NULL) OR
  ("kind" = 'PERFORMANCE'  AND "employeeId" IS NOT NULL AND "candidateId" IS NULL AND "periodId" IS NOT NULL) OR
  ("kind" = 'LEVEL_REVIEW' AND "employeeId" IS NOT NULL AND "candidateId" IS NULL));

-- One live performance assessment per employee+period+rubric version (reassessments supersede)
CREATE UNIQUE INDEX one_live_perf_assessment ON "Assessment" ("employeeId","periodId","rubricVersionId")
  WHERE "kind" = 'PERFORMANCE' AND "status" NOT IN ('REJECTED','REASSESSED');

-- Only one ACTIVE version per rubric
CREATE UNIQUE INDEX one_active_version ON "RubricVersion" ("rubricId") WHERE "status" = 'ACTIVE';

-- Active level ranks unique
CREATE UNIQUE INDEX active_level_rank ON "CareerLevel" ("orgId","rank") WHERE "isActive";

-- Money
ALTER TABLE "SalaryBand"  ADD CONSTRAINT band_order CHECK ("minAmount" >= 0 AND "minAmount" <= "maxAmount");
ALTER TABLE "SalaryBand"  ADD CONSTRAINT band_dates CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "Evidence"    ADD CONSTRAINT fees_nonneg CHECK (coalesce("serviceFee",0) >= 0 AND coalesce("governmentFee",0) >= 0);
ALTER TABLE "Evidence"    ADD CONSTRAINT ext_id_required CHECK ("source" = 'MANUAL' OR "externalId" IS NOT NULL);
ALTER TABLE "RewardBudget"         ADD CONSTRAINT budget_nonneg CHECK ("amount" >= 0);
ALTER TABLE "RewardRecommendation" ADD CONSTRAINT reward_amount CHECK (
  ("kind" = 'CASH' AND "amount" IS NOT NULL AND "amount" >= 0) OR ("kind" = 'RECOGNITION' AND "amount" IS NULL));
ALTER TABLE "CompensationRecommendation" ADD CONSTRAINT comp_subject CHECK (
  ("subject" = 'CANDIDATE' AND "candidateId" IS NOT NULL AND "employeeId" IS NULL) OR
  ("subject" = 'EMPLOYEE'  AND "employeeId"  IS NOT NULL AND "candidateId" IS NULL));

-- Salary bands: no overlapping effective ranges for the same position+level
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "SalaryBand" ADD CONSTRAINT band_no_overlap EXCLUDE USING gist (
  "positionId" WITH =, "levelId" WITH =,
  daterange("effectiveFrom", coalesce("effectiveTo", 'infinity'::date), '[)') WITH &&);

-- Periods do not overlap
ALTER TABLE "PerformancePeriod" ADD CONSTRAINT period_no_overlap EXCLUDE USING gist (
  "orgId" WITH =, daterange("startsOn", "endsOn", '[]') WITH &&);

-- Immutability: locked rubric versions and their criteria/questions
CREATE FUNCTION forbid_locked_rubric_change() RETURNS trigger AS $$ … raise exception if parent version isLocked $$;
-- triggers on RubricCriterion, AssessmentQuestion (UPDATE/DELETE/INSERT) and RubricVersion (UPDATE of anything except status RETIRED)

-- Approved assessments: criterion results and totals frozen
CREATE FUNCTION forbid_approved_assessment_change() …;  -- triggers on CriterionResult and Assessment(totalScore, calcSnapshot)

-- Append-only audit
REVOKE UPDATE, DELETE ON "AuditEvent" FROM orbita_app;
```

The application role `orbita_app` owns no DDL rights; migrations run as `orbita_migrator`.

## 5. Uniqueness and idempotency keys

| Rule | Constraint |
|---|---|
| No duplicate evidence from import/CRM | `Evidence @@unique([orgId, source, externalId])` + CHECK external id required for non-manual |
| One evidence → one criterion per period | `EvidenceAllocation @@unique([evidenceId, periodId])` |
| No duplicate reward | `RewardRecommendation @@unique([employeeId, periodId, policyId])` |
| One budget per policy per period | `RewardBudget @@unique([policyId, periodId])` |
| CRM record mapped once | `ExternalMapping @@unique([connectionId, entityType, externalId])` |
| One answer per question | `CandidateResponse @@unique([assessmentId, questionId])` |
| One result per criterion | `CriterionResult @@unique([assessmentId, criterionId])` |
| Jobs not enqueued twice | `Job.idempotencyKey @unique` |
| Candidate hired once | `Employee.fromCandidateId @unique` |

## 6. Deletion behaviour

- Default `onDelete: Restrict` for anything referenced by decisions, scores, money or audit.
- `Cascade` only for pure children with no independent meaning: role permissions, sessions, reset tokens, criteria/questions of an **unlocked draft** version (trigger blocks it otherwise), attachments of evidence, responses/results of a deleted **draft** assessment, notifications of a deleted user.
- `SetNull` for optional provenance pointers (AI run, import batch, granted-by user).
- Users are disabled, not deleted. Candidates are anonymized by the retention job.

## 7. Indexes (beyond PK/unique)

| Query | Index |
|---|---|
| Verification queue for a manager's units | `Evidence(orgId, status)` + join on Employee(orgId, orgUnitId, status) |
| Employee evidence per period | `Evidence(employeeId, periodId, status)` |
| Ranking cohort | `Assessment(periodId, rubricVersionId, status)` |
| Review queue | `Assessment(orgId, kind, status)` |
| Audit timeline of an entity | `AuditEvent(orgId, entityType, entityId, createdAt)` |
| Unread notifications | `Notification(userId, readAt, createdAt)` |
| Job polling | `Job(status, runAt)` |
| Scope checks | `OrgUnit(orgId, path)` (text_pattern_ops in raw SQL) |
| Retention sweep | `Candidate(retentionUntil)`, `Session(absExpires)` |

## 8. Snapshots for reproducibility

`Assessment.calcSnapshot` stores the complete input and output of `domain/scoring.computeAssessment()` together with `calcVersion` (the domain package version). Re-running the same version over the snapshot inputs must return an identical result; a test enforces this. `PromotionRecommendation.eligibility`, `CompensationRecommendation.explanation` and `RewardRecommendation.explanation` follow the same pattern.

## 9. Audit coverage (minimum)

`user.*`, `role.*`, `rubric.version.created|activated|retired`, `criterion.*` (draft only), `level.*`, `salaryBand.*`, `rewardPolicy.*`, `evidence.verified|rejected`, `assessment.created|scored|submitted|approved|rejected`, `appeal.*`, `promotion.*`, `hiring.decided`, `compensation.*`, `reward.proposed|approved|paid|cancelled`, `invite.created|revoked`, `import.applied`, `crm.status_changed`, `auth.login_failed|password_reset`, `ai.run_accepted` (when a human accepts an AI suggestion).

Audit `before/after` contain the changed fields only. Salary/reward amounts appear in audit rows, so `audit:read` is an admin-only permission.
