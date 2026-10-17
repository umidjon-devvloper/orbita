# Implementation Plan — Orbita

Status: Draft for review · Phase 1. Each slice ends with: tests green → `PROGRESS.md` updated → commit.

## Phase 1 — Audit & spec ✅ (this delivery)

Repository was empty → greenfield. Deliverables: PRD, ARCHITECTURE, DATABASE_DESIGN (+ validated draft schema), SCORING_MODEL (+ executable reference), SECURITY, this plan, OPEN_QUESTIONS, DECISIONS, PROGRESS, CLAUDE.md.
**STOP for owner review.**

## Phase 2 — Foundation (2.1 ✅ 2.2 ✅)

| #   | Slice                                                                                                                                                                                            | Done when                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 2.1 | pnpm workspace, tsconfig strict, ESLint (import boundaries), Prettier, Vitest, docker-compose (Postgres 16, Mailpit), `.env.example`, CI script                                                  | `pnpm lint typecheck test` runs green on empty packages                                     |
| 2.2 | `packages/domain`: port `scoring-reference.mjs` to TS (money, scoring, rubric validation, gates, ranking, rewards, salary, state machines, authz)                                                | EX1–EX10 reproduced exactly in table-driven tests; 100 % branch coverage on `domain`        |
| 2.3 | Prisma schema + generated migration + raw constraints migration; `prisma.config.ts`; seed skeleton                                                                                               | `prisma validate`, `migrate dev` on clean DB; constraint tests (insert bad rows → rejected) |
| 2.4 | API skeleton: config parsing, pino, request id, problem+json errors, health, Prisma plugin                                                                                                       | integration test boots app against test DB                                                  |
| 2.5 | Auth: login/logout/me, sessions, CSRF, rate limits, password reset with ConsoleMailer/Mailpit                                                                                                    | integration tests incl. lockout, expired session, reset token single use                    |
| 2.6 | RBAC: permission catalogue, role seed, scope resolution, `requirePermission` hook, SoD helpers; AuditEvent writer                                                                                | permission-matrix test file (allowed + forbidden per row)                                   |
| 2.7 | Web: Next.js app, design tokens (light/dark), next-themes no-flash, next-intl uz/ru/en with missing-key test, app shell, login/forgot/reset pages, 401/403 pages, `/dev/ui` with base components | Playwright: login in 3 locales × 2 themes; axe no serious issues on login + shell           |

## Phase 3 — Configuration

| #   | Slice                                                                                                                 | Done when                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 3.1 | Org units + users + role assignments (admin UI)                                                                       | CRUD + scope tests                                                     |
| 3.2 | Specialties, positions, competencies (localized names)                                                                | CRUD, uniqueness, fallback to uz                                       |
| 3.3 | Career levels + level requirements + reorder/disable                                                                  | rank uniqueness, UNAPPROVED badge                                      |
| 3.4 | Salary bands (overlap exclusion)                                                                                      | band tests incl. overlapping dates rejected                            |
| 3.5 | Rubric builder: versions, criteria, weights (percent UI ↔ bp), metric config editor, preview, activate, clone-on-edit | invalid weights rejected (unit + API); locked version edit → new draft |

## Phase 4 — Employee assessment

| #   | Slice                                                                                                                             | Done when                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 4.1 | Periods (open/close/finalize)                                                                                                     | non-overlap, Tashkent dates                                 |
| 4.2 | Evidence submit + attachments (Storage) + verification queue + SoD                                                                | upload validation tests; cannot verify own                  |
| 4.3 | Performance assessment: auto-allocation of verified evidence, metric computation, manual scores, INCOMPLETE reasons, calcSnapshot | EX1/EX4/EX6 reproduced through the API                      |
| 4.4 | Review → approve/reject, employee view, notifications                                                                             | state-machine tests; approved rows immutable (trigger test) |
| 4.5 | Appeals → reassessment chain                                                                                                      | E2E journey 12                                              |
| 4.6 | Level review assessment + promotion recommendation + approval + level history                                                     | EX8 via API; approver ≠ recommender                         |

## Phase 5 — Candidate assessment

| #   | Slice                                                                      | Done when                          |
| --- | -------------------------------------------------------------------------- | ---------------------------------- |
| 5.1 | Candidates CRUD, consent text, retention date                              | —                                  |
| 5.2 | Question bank per rubric version (human-authored), approval                | only APPROVED questions in invites |
| 5.3 | Invite tokens + public candidate UI (autosave, time limit, submit, locale) | token expiry/revoke/reuse tests    |
| 5.4 | Auto-scoring + human scoring screen + report (EX7) + salary recommendation | report matches EX7                 |
| 5.5 | Hiring decision + create employee from candidate                           | E2E journeys 2, 3, 5               |

## Phase 6 — AI

| #   | Slice                                                                                                  | Done when                                                        |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 6.1 | AiProvider interface, MockProvider, AnthropicProvider, AiRun, job runner, pseudonymizer + PII scrubber | invalid output → INVALID_OUTPUT; provider down → non-AI flows OK |
| 6.2 | Question drafting (AI_DRAFT → human approve)                                                           | drafts never used unapproved                                     |
| 6.3 | Suggested scores + rationale for MANUAL criteria; accept/override UI                                   | both values stored                                               |
| 6.4 | Assessment explanation panel (criterion, evidence refs, coverage, limits, next step)                   | E2E journey 4                                                    |
| 6.5 | Skill gaps → development items                                                                         | accept into plan                                                 |

## Phase 7 — Rankings & rewards

| #   | Slice                                              | Done when                           |
| --- | -------------------------------------------------- | ----------------------------------- |
| 7.1 | Cohort ranking page                                | EX9; never mixes specialties (test) |
| 7.2 | Reward policies, budgets, generate recommendations | EX10; duplicate impossible (test)   |
| 7.3 | Approve / cancel / mark paid, budget report        | E2E journey 11                      |

## Phase 8 — CRM readiness & import

| #   | Slice                                                                      | Done when                 |
| --- | -------------------------------------------------------------------------- | ------------------------- |
| 8.1 | CSV import (employees, service records): dry run, error report, apply      | re-import → 0 duplicates  |
| 8.2 | CrmAdapter interface, MockCrmAdapter, mapping layer, sync job, status page | idempotency + retry tests |

## Phase 9 — Hardening

Full E2E suite (12 journeys), mobile layouts, theme sweep, axe on all main pages, retention job dry-run, README with setup, final report.

## Cross-cutting definition of a finished slice

- Domain rules in `packages/domain` with unit tests.
- API route with Zod contracts, permission check, transaction, audit event, integration test (allowed + forbidden).
- UI with loading, empty, error, forbidden states; all strings in 3 locales.
- No dead controls. Docs updated.
