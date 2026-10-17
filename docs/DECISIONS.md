# Decisions log

One line each: ID · date · decision — reason.

- D-01 · 2026-10-18 · Greenfield: repository was empty, so the v2 stack is adopted as-is — no existing code to preserve.
- D-02 · 2026-10-18 · Modular monolith in a pnpm monorepo (web, api, domain, contracts, i18n) — one team, strong consistency needs, simplest deploy.
- D-03 · 2026-10-18 · All business rules live in `packages/domain` as pure functions returning `Result` — testable without DB, reproducible snapshots.
- D-04 · 2026-10-18 · Prisma **7.x stable** pinned (not 8.0 RC, which is currently npm `latest`): connection URL in `prisma.config.ts`, `prisma-client` generator, `@prisma/adapter-pg` at runtime — avoid pre-release ORM in a product handling money.
- D-05 · 2026-10-18 · Draft schema validated with Prisma's WASM validator (7.1 and 8.1); CLI validation + migration run deferred to Phase 2 because engine binaries cannot be downloaded in the spec environment.
- D-06 · 2026-10-18 · UUIDv7 primary keys — time-sortable, non-guessable, safe in URLs.
- D-07 · 2026-10-18 · Scores stored as integer hundredths (0–10000) instead of `Decimal(5,2)` — identical precision, exact integer math in TS and SQL, no decimal library.
- D-08 · 2026-10-18 · Weights in basis points, must sum to exactly 10000 — integer validation, no float tolerance.
- D-09 · 2026-10-18 · Money as `BigInt` whole UZS, transported as JSON strings — avoids JS number precision issues.
- D-10 · 2026-10-18 · Rounding: once per stored number, half-up; reward amounts rounded down to step — never exceed budget/cap.
- D-11 · 2026-10-18 · One `Assessment` table for CANDIDATE / PERFORMANCE / LEVEL_REVIEW with a CHECK on subject columns — one scoring engine, one review UI.
- D-12 · 2026-10-18 · Promotion eligibility uses LEVEL_REVIEW assessments; monthly performance is context only — keeps "level" and "monthly result" separate as required.
- D-13 · 2026-10-18 · Level requirements cumulative up to target level; failed checks never lower a current level.
- D-14 · 2026-10-18 · Learning and mentoring modelled as evidence types, not separate tables — same lifecycle (submit, verify, allocate).
- D-15 · 2026-10-18 · `EvidenceAllocation` unique (evidenceId, periodId) enforces "count once" at DB level.
- D-16 · 2026-10-18 · `governmentFee` is not a selectable measure field in metric configs — revenue misuse impossible by construction.
- D-17 · 2026-10-18 · Ranking = competition ranking (1,2,2,4), cohort = specialty + rubric version + period, min cohort 3.
- D-18 · 2026-10-18 · Reward pool per policy, policy bound to specialty + rubric version — no cross-specialty comparisons; capped remainder not redistributed by default (flag).
- D-19 · 2026-10-18 · Salary point = position inside band by progress between current and next level threshold, range ± 10 % of band width — explainable, uses only configured data.
- D-20 · 2026-10-18 · Server-side sessions in Postgres + CSRF synchronizer token; Next.js rewrites `/api/*` to Fastify for same-origin cookies.
- D-21 · 2026-10-18 · Permission + scope (OWN / ORG_UNIT / ORG) model; org-unit subtree via materialized path.
- D-22 · 2026-10-18 · Separation of duties on by default (no self-verification/approval, approver ≠ recommender).
- D-23 · 2026-10-18 · Localized configuration text stored as JSON `{uz, ru, en}` with `uz` required; user content never translated.
- D-24 · 2026-10-18 · Background jobs on a Postgres table with `SKIP LOCKED` — no Redis needed for MVP volume.
- D-25 · 2026-10-18 · AI provider defaults to Mock until legal answers Q20; pseudonyms + PII scrubber on every AI input.
- D-26 · 2026-10-18 · Audit table append-only via DB privileges; separate migrator and app DB roles.
