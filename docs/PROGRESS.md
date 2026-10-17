# Progress

## Done

- **Phase 1 — Audit & spec** (2026-10-18)
  - Repository audit: empty → greenfield.
  - Docs: PRD, ARCHITECTURE, DATABASE_DESIGN, SCORING_MODEL, SECURITY, IMPLEMENTATION_PLAN, OPEN_QUESTIONS, DECISIONS.
  - `docs/schema.draft.prisma`: 46 models, 32 enums — valid (Prisma WASM validator 7.1 and 8.1).
  - `docs/examples/scoring-reference.mjs`: executable reference for EX1–EX10.
- **2.1 — Workspace tooling** (2026-10-18)
  - pnpm workspace, strict TS 6.0 base config, ESLint 10 + typescript-eslint strict-type-checked with domain-purity rules, Prettier, Vitest 5 with v8 coverage, docker-compose (Postgres 16, Mailpit), `.env.example`, `pnpm run verify`.
- **2.2 — `packages/domain`** (2026-10-18)
  - Modules: result, math, score, money, evidence (dedupe, measures), rubric (validation), metrics, scoring (`computeAssessment`, `CALC_VERSION 1.0.0`), levels (starting level, promotion check), ranking, rewards, salary, workflow (6 state machines), authz (permission catalogue, scopes, default roles, separation of duties).
  - 99 tests in 5 files; EX1–EX10 reproduced exactly; coverage 100 % lines/branches/functions/statements.
  - Design fix D-27 (record vs contribution evidence) applied to code and docs.

## In progress

- Nothing.

## Next

- 2.3 — `apps/api` Prisma schema from the draft, `prisma.config.ts`, generated + raw constraint migrations, constraint tests against local Postgres 16.
- 2.4 — API skeleton (config, pino, problem+json, health).
