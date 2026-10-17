# CLAUDE.md — standing rules for Orbita

Read this file, `docs/PROGRESS.md` and `docs/DECISIONS.md` at the start of every session.

## Product in one line

Employee assessment, career leveling, candidate evaluation, compensation recommendation and rewards platform for an online services center in Uzbekistan. Brand placeholder: **Orbita** (single config value `BRAND_NAME`).

## How to work

- Inspect before changing. Preserve existing working code.
- Vertical slices: DB → domain → API → UI → tests, one feature at a time. Commit per slice.
- Update `docs/PROGRESS.md` after each slice; log each decision/assumption in `docs/DECISIONS.md` (one line, with reason).
- Business facts you do not know go to `docs/OPEN_QUESTIONS.md` with a safe configurable default. Never invent salaries, budgets, promotion rules, CRM fields, government procedures.
- Never mark done without running its tests. Never fake success. Never present demo data as real.
- Ask the owner only about business policy, hiring, compensation, privacy, legal. Decide technical details yourself.
- Never commit secrets. `.env` ignored, `.env.example` current.

## Stack (fixed)

pnpm monorepo — `apps/web` (Next.js App Router, TS strict, Tailwind, shadcn/ui, Lucide, RHF+Zod, TanStack Table, Recharts, next-intl, next-themes), `apps/api` (Fastify, TS strict, Prisma, PostgreSQL, pino, fastify-type-provider-zod, `/api/v1`), `packages/domain` (pure TS, no I/O), `packages/contracts` (shared Zod), `packages/i18n` (uz/ru/en). Tests: Vitest, Playwright, docker-compose Postgres. Jobs: Postgres job table.

## Domain invariants (see docs/SCORING_MODEL.md for detail)

- Career level ≠ monthly performance. Level changes only through an APPROVED promotion.
- Rubric versions are immutable once used. Weights in basis points, sum = 10000 exactly.
- Scores: integer hundredths (0–10000) in domain and DB (D-07); rounded half-up once per stored number.
- Missing required evidence → INCOMPLETE, cannot finalize.
- AI never writes scores; it suggests, a human decides; both stored.
- Evidence counts only when VERIFIED; unique (orgId, source, externalId); RECORD evidence (service records, sales, feedback) is read by metric criteria, and no two criteria may read the same field (validated); CONTRIBUTION evidence (training, mentoring, improvements…) is allocated to exactly one criterion per period (D-27).
- Revenue = `serviceFee` only. `governmentFee` never counts.
- Money: UZS whole som, `BigInt`, no floats.
- Ranking only within specialty + rubric version + period; min cohort 3; competition ranking (1,2,2,4).
- Rewards: unique (employee, period, policy); PAID is a manual mark.
- Never infer competence from protected attributes. Never auto-hire/reject/set salary/change payroll. Tenure is context, not a score.

## Security

Permissions enforced on API (UI hiding is cosmetic). Scope: OWN / ORG_UNIT / ORG. Every sensitive change → AuditEvent. AI calls pseudonymized; never send PINFL, passport, phone, passwords, OTP, e-signature data.

## UI

Calm, data-dense, one accent color, semantic CSS tokens for light+dark, no emoji icons, no gradients/glass, no fake activity, no dead buttons. Uzbek (Latin, "Siz") default, Russian, English; no hardcoded strings. Light/dark/system, no flash. WCAG AA, keyboard, reduced motion, status = icon + text.
