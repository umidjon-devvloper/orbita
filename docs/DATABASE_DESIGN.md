# Database Design — Orbita

Status: Draft for review · Phase 1
Source of truth for the model: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) — 46 models, 32 enums, Prisma 7.10. Migrations: `apps/api/prisma/migrations/` (extensions → init → constraints).

## 1. Conventions

| Topic                           | Rule                                                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs                             | UUIDv7 (`@default(uuid(7))`, `uuid` column) — sortable by time, safe to expose                                                                                                                     |
| Tenancy                         | Every root entity has `orgId`; all queries filter by the user's org. Single-org deployment in MVP, multi-org-ready.                                                                                |
| Scores                          | **Integer hundredths** `0–10000` (`74.90` → `7490`). Exact integer math, no `Decimal` arithmetic in JS. Displayed with 2 decimals.                                                                 |
| Weights                         | Integer basis points; active criteria of a rubric version sum to `10000`.                                                                                                                          |
| Money                           | `BIGINT` whole UZS. JSON transport as strings. Currency column kept for future multi-currency (`UZS` only in MVP).                                                                                 |
| Dates                           | `timestamptz(3)` for events (every `DateTime` without `@db.Date` is annotated `@db.Timestamptz(3)`); `date` for business dates (periods, hire date, evidence date) interpreted in `Asia/Tashkent`. |
| Localized config text           | `Json` `{ "uz": "...", "ru": "...", "en": "..." }`, `uz` required; fallback chain `requested → uz`. User-generated content (feedback, evidence text) is plain `text` and never translated.         |
| Demo data                       | `isDemo` on every seedable table; `db:seed:clear-demo` deletes by flag; UI banner when any demo row exists.                                                                                        |
| Approval of illustrative config | `approval = UNAPPROVED` on levels, salary bands, reward policies until the owner approves. UI shows a badge.                                                                                       |
| Soft delete                     | Not used. Config entities are deactivated with `isActive=false`; history entities are never deleted (retention job anonymizes).                                                                    |

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
  Evidence ||--o{ EvidenceAllocation : "contribution evidence: max 1 per period"
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

| Module      | Tables                                                                                                           | Notes                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Identity    | Organization, OrgUnit, User, Role, RolePermission, RoleAssignment, Session, PasswordResetToken                   | OrgUnit uses materialized `path` for subtree scope checks (`path LIKE '/root/unit/%'`).            |
| Catalog     | Specialty, Position, Competency, PositionCompetency                                                              | Competencies are org-wide and reused across specialties.                                           |
| Framework   | CareerLevel, LevelRequirement, SalaryBand                                                                        | Requirements are per (level, specialty, competency); `isGate` marks must-pass.                     |
| Rubrics     | Rubric, RubricVersion, RubricCriterion, AssessmentQuestion                                                       | One rubric per (specialty, purpose); versions immutable once locked.                               |
| People      | Employee, Candidate                                                                                              | Both carry a stable `pseudonym` used for AI and exports.                                           |
| Assessment  | PerformancePeriod, Assessment, AssessmentInvite, CandidateResponse, CriterionResult                              | One `Assessment` table for three kinds; subject columns validated by CHECK.                        |
| Evidence    | Evidence, EvidenceAttachment, EvidenceAllocation                                                                 | Learning and mentoring are evidence types, not separate tables (one concept: verifiable activity). |
| Decisions   | Appeal, PromotionRecommendation, CareerLevelHistory, HiringDecision, CompensationRecommendation, DevelopmentItem | Each decision row stores who, when, and the domain snapshot it was based on.                       |
| Rewards     | RewardPolicy, RewardBudget, RewardRecommendation                                                                 | Policy tied to specialty + rubric version = the comparison cohort.                                 |
| Platform    | Notification, AuditEvent, AiRun, ReferenceDocument                                                               | AuditEvent append-only.                                                                            |
| Integration | CrmConnection, ExternalMapping, ImportBatch, Job                                                                 | Credentials never stored in DB.                                                                    |

## 4. Constraints Prisma cannot express

Implemented in [`apps/api/prisma/migrations/*_constraints/migration.sql`](../apps/api/prisma/migrations) (the single source — not copied here) and proven by `apps/api/src/db/constraints.db.test.ts` against a real Postgres 16.

| Rule                                                             | Mechanism            | Error code / name                                                    |
| ---------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| Scores, weights, thresholds in 0–100                             | CHECK                | `*_range`, `RubricCriterion_gate_min`                                |
| Gate criterion has a minimum; evidence count consistent          | CHECK                | `RubricCriterion_gate_min`, `_min_evidence`                          |
| Config names carry Uzbek                                         | CHECK on JSON        | `*_name_uz`, `Position_title_uz`                                     |
| Assessment subject matches kind; compensation subject            | CHECK                | `Assessment_subject_by_kind`, `CompensationRecommendation_subject`   |
| One live performance assessment per employee+period+version      | partial UNIQUE       | `Assessment_one_live_performance`                                    |
| One ACTIVE version per rubric; unique active level rank          | partial UNIQUE       | `RubricVersion_one_active`, `CareerLevel_active_rank`                |
| Money non-negative; bands min ≤ max; PAID has who+when           | CHECK                | `SalaryBand_order`, `Evidence_fees_nonneg`, `RewardRecommendation_*` |
| Imported evidence has an external id; CSAT 1–5                   | CHECK                | `Evidence_external_id_required`, `Evidence_csat_range`               |
| Bands and periods never overlap                                  | EXCLUDE (btree_gist) | `SalaryBand_no_overlap`, `PerformancePeriod_no_overlap`              |
| Rubric version locks on first assessment, then immutable         | triggers             | `orbita:rubric.versionLocked`                                        |
| Final assessments (approved/rejected/appealed/reassessed) frozen | triggers             | `orbita:assessment.finalized`                                        |
| Only contribution evidence is allocated, same period             | trigger              | `orbita:allocation.*`                                                |
| Audit log append-only (UPDATE/DELETE/TRUNCATE) for every role    | triggers             | `orbita:audit.appendOnly`                                            |

Rules of thumb learned while testing:

- **A CHECK passes when its expression is NULL.** Every nullable expression is wrapped in `IS TRUE` (two such bugs were caught by the tests before commit).
- Trigger errors carry a stable `orbita:<code>` message that the API maps to an i18n key.
- Audit immutability is a trigger, not only a privilege, so it also binds the table owner. Retention purges run as a maintenance job that disables the trigger inside its own transaction.

### Migration tooling

- Normal machines: `pnpm db:migrate` (`prisma migrate deploy`), `prisma migrate dev` to create migrations.
- Where `binaries.prisma.sh` is unreachable: `apps/api/scripts/schema-engine-wasm.mjs` uses Prisma's schema engine compiled to WASM (pinned to the CLI's engine build) to create migrations schema-to-schema, and applies migrations one transaction each with the same `_prisma_migrations` bookkeeping (sha256 checksum). Histories are interchangeable with the native CLI.

## 5. Uniqueness and idempotency keys

| Rule                                             | Constraint                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| No duplicate evidence from import/CRM            | `Evidence @@unique([orgId, source, externalId])` + CHECK external id required for non-manual              |
| Contribution evidence → one criterion per period | `EvidenceAllocation @@unique([evidenceId, periodId])` + trigger: only CONTRIBUTION types may be allocated |
| No duplicate reward                              | `RewardRecommendation @@unique([employeeId, periodId, policyId])`                                         |
| One budget per policy per period                 | `RewardBudget @@unique([policyId, periodId])`                                                             |
| CRM record mapped once                           | `ExternalMapping @@unique([connectionId, entityType, externalId])`                                        |
| One answer per question                          | `CandidateResponse @@unique([assessmentId, questionId])`                                                  |
| One result per criterion                         | `CriterionResult @@unique([assessmentId, criterionId])`                                                   |
| Jobs not enqueued twice                          | `Job.idempotencyKey @unique`                                                                              |
| Candidate hired once                             | `Employee.fromCandidateId @unique`                                                                        |

## 6. Deletion behaviour

- Default `onDelete: Restrict` for anything referenced by decisions, scores, money or audit.
- `Cascade` only for pure children with no independent meaning: role permissions, sessions, reset tokens, criteria/questions of an **unlocked draft** version (trigger blocks it otherwise), attachments of evidence, responses/results of a deleted **draft** assessment, notifications of a deleted user.
- `SetNull` for optional provenance pointers (AI run, import batch, granted-by user).
- Users are disabled, not deleted. Candidates are anonymized by the retention job.

## 7. Indexes (beyond PK/unique)

| Query                                    | Index                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Verification queue for a manager's units | `Evidence(orgId, status)` + join on Employee(orgId, orgUnitId, status) |
| Employee evidence per period             | `Evidence(employeeId, periodId, status)`                               |
| Ranking cohort                           | `Assessment(periodId, rubricVersionId, status)`                        |
| Review queue                             | `Assessment(orgId, kind, status)`                                      |
| Audit timeline of an entity              | `AuditEvent(orgId, entityType, entityId, createdAt)`                   |
| Unread notifications                     | `Notification(userId, readAt, createdAt)`                              |
| Job polling                              | `Job(status, runAt)`                                                   |
| Scope checks                             | `OrgUnit(orgId, path)` (text_pattern_ops in raw SQL)                   |
| Retention sweep                          | `Candidate(retentionUntil)`, `Session(absExpires)`                     |

## 8. Snapshots for reproducibility

`Assessment.calcSnapshot` stores the complete input and output of `domain/scoring.computeAssessment()` together with `calcVersion` (the domain package version). Re-running the same version over the snapshot inputs must return an identical result; a test enforces this. `PromotionRecommendation.eligibility`, `CompensationRecommendation.explanation` and `RewardRecommendation.explanation` follow the same pattern.

## 9. Audit coverage (minimum)

`user.*`, `role.*`, `rubric.version.created|activated|retired`, `criterion.*` (draft only), `level.*`, `salaryBand.*`, `rewardPolicy.*`, `evidence.verified|rejected`, `assessment.created|scored|submitted|approved|rejected`, `appeal.*`, `promotion.*`, `hiring.decided`, `compensation.*`, `reward.proposed|approved|paid|cancelled`, `invite.created|revoked`, `import.applied`, `crm.status_changed`, `auth.login_failed|password_reset`, `ai.run_accepted` (when a human accepts an AI suggestion).

Audit `before/after` contain the changed fields only. Salary/reward amounts appear in audit rows, so `audit:read` is an admin-only permission.
