# Employee Assessment & Career Growth Platform — Build Prompt (v2)

## 0. Context

You are building an MVP for an online services center in Uzbekistan (government digital services + other paid online services). The platform:

1. Assesses job candidates against their **specific specialty** and recommends a starting level and salary range.
2. Tracks employees' **long-term career level** separately from **monthly performance**.
3. Calculates monthly rankings and reward recommendations from **verified evidence**.
4. Uses AI as an **assistant** (drafting, analysis, explanations) — never as the decision maker.
5. Is ready for a future CRM integration whose product and API are **not yet known**.

Specialties are configurable (service operator, customer support, digital service specialist, sales, operations, QA, team lead, …). Never assume all roles share competencies or scoring rules.

Brand: use the placeholder name `Orbita` (configurable in one place).

---

## 1. How you work (read this first, follow it always)

- **Inspect before changing.** Read the repo structure, manifests, README, env examples, schema and test config. Preserve existing working code. If the folder is empty, scaffold the architecture in §2.
- **Persistent memory.** Create and maintain:
  - `CLAUDE.md` — standing rules from §1–§6 of this prompt, condensed. Re-read it at the start of every session.
  - `docs/PROGRESS.md` — what is done, what is in progress, what is next. Update after every slice.
  - `docs/DECISIONS.md` — every technical decision and every assumption, one line each, with reason.
  - `docs/OPEN_QUESTIONS.md` — business facts you must not invent (see §11).
- **Checkpoint after Phase 1.** After writing the spec, data model and scoring model, STOP and wait for my review. Changing the data model later is expensive. After that checkpoint, continue autonomously phase by phase.
- **Vertical slices.** Build features end-to-end (DB → domain → API → UI → tests) one at a time instead of all screens first. A small working product beats many disconnected screens.
- **Commit per slice** with a clear message. Never commit secrets; `.env` stays in `.gitignore`, `.env.example` is kept current.
- **Honesty.** Never mark something done without running its tests. Never show a success toast for a failed operation. Never present demo data as real. If a check fails, report it — do not hide it.
- **Decide technical details yourself**; record them in `DECISIONS.md`. Ask me only when a decision affects business policy, hiring, compensation, privacy or legal compliance — and even then, implement a safe configurable default and log the question.

---

## 2. Tech stack (decided — deviate only if the existing repo already uses something else)

pnpm monorepo:

```
apps/web        Next.js (App Router), React, TypeScript strict
apps/api        Fastify, TypeScript strict, Prisma, PostgreSQL
packages/domain Pure TS business logic: scoring, eligibility, rewards, salary, dedupe. NO I/O, NO framework imports.
packages/contracts Zod schemas shared by web and api (request/response DTOs, enums)
packages/i18n   Locale files (uz, ru, en) + helpers
```

- UI: Tailwind CSS, shadcn/ui, Lucide icons, React Hook Form + Zod, TanStack Table, Recharts.
- i18n: `next-intl`, ICU message format. Theme: `next-themes` (no flash on load).
- API: `fastify-type-provider-zod`, versioned under `/api/v1`, OpenAPI generated from Zod.
- Auth: email + password, Argon2id hashing, server-side sessions stored in Postgres, `HttpOnly; Secure; SameSite=Lax` cookie. The web app proxies `/api/*` to Fastify (Next rewrites) so cookies are same-origin. CSRF token for state-changing requests.
- Logging: pino (structured, with request IDs, no PII in logs).
- Email: `Mailer` interface; `ConsoleMailer` in dev, SMTP via env in prod.
- File uploads (evidence): `Storage` interface; local disk in dev. Validate MIME, size, extension; files are private and served only through an authorized endpoint.
- Tests: Vitest (unit + API integration), Playwright (E2E), Postgres via `docker-compose`.
- Background jobs (CRM sync, AI retries): a simple Postgres-backed job table. No Redis unless truly needed.

---

## 3. Domain rules (invariants — implement in `packages/domain`, cover with unit tests)

### 3.1 Two separate concepts
- **Career level** = demonstrated competence, autonomy, complexity of work. Changes only via an approved promotion decision.
- **Monthly performance** = results in one period. A weak month never lowers a level; a strong month never promotes automatically.

### 3.2 Rubrics
- A rubric belongs to a specialty and has versions. **A version becomes immutable once any assessment uses it.** Edits create a new version. Past assessments always reproduce with their own version.
- Weights are stored as integers in **basis points**; applicable criteria weights must sum to exactly `10000`. An invalid rubric cannot be activated, and an assessment on it cannot be finalized.
- Criteria can be marked **mandatory gate**: failing a gate blocks promotion/hiring-level recommendation regardless of total score.

### 3.3 Scoring (deterministic)
- Criterion score: decimal `0–100`, stored as `Decimal(5,2)`. Total = weighted mean. Rounding: half-up to 2 decimals, applied once at the end.
- Missing required evidence → assessment status `INCOMPLETE`, cannot be finalized; UI lists what is missing.
- Not-applicable criteria: excluded only if the rubric explicitly allows renormalization (default: not allowed).
- AI never writes scores directly. AI may *suggest* a score for subjective criteria; a human must accept or change it, and both values are stored.
- Every score stores: rubric version id, inputs, evidence ids, calculated result, evaluator, timestamp.

### 3.4 Evidence
- Each evidence item has `source` (MANUAL, CSV_IMPORT, CRM) and optional `externalId`; unique on `(source, externalId)`.
- An evidence item can contribute to **at most one criterion per period** (enforced by a unique constraint).
- States: `SUBMITTED → VERIFIED | REJECTED`. Only VERIFIED evidence counts.
- Revenue evidence stores `serviceFee` (company revenue) and `governmentFee` (collected on behalf of the state) separately. **Only `serviceFee` counts toward revenue criteria.**

### 3.5 Workflows (explicit state machines, transitions validated server-side, each transition audited)
- Assessment: `DRAFT → IN_PROGRESS → SUBMITTED → (AI_ANALYZED) → UNDER_REVIEW → APPROVED | REJECTED`; `APPROVED → APPEALED → REASSESSED`.
- Promotion: `RECOMMENDED → APPROVED | REJECTED`.
- Reward: `PROPOSED → APPROVED → PAID | CANCELLED`. Unique on `(employeeId, periodId, policyId)` — no duplicate payouts. `PAID` is a manual mark; no money is moved by the system.

### 3.6 Ranking
- Rank only within the same **specialty + rubric version + period**. Cohort smaller than a configurable minimum (default 3) → show scores, no rank. Ties share a rank.
- Always show score components and verified vs pending evidence, not only the final position.

### 3.7 Money
- UZS stored as integer (`BigInt`, whole som). No floating-point money math. Recommendation rounding step is configurable (default 1,000 UZS).
- Salary recommendation = position within an admin-configured band for (position, level). The explanation states the band, the inputs, and missing data. Never invent market salaries.
- Rewards: policy is configurable. Default example (marked `UNAPPROVED`): eligible = approved assessment ≥ threshold; budget pool split proportionally to score above threshold, with a per-person cap.

### 3.8 Never
- Infer competence from age, gender, ethnicity, appearance, voice, disability or unrelated personal data.
- Auto-reject candidates, auto-decide hiring, auto-set salary, or auto-change payroll.
- Count tenure as a substitute for demonstrated quality.

---

## 4. Access control

Permission-based (e.g. `employee:read`, `compensation:read`, `reward:approve`), roles are bundles of permissions. Enforce on the API; UI hiding is cosmetic only. Managers are scoped to their **org units**.

| Capability | Admin | Manager/HR | Employee | Candidate |
|---|---|---|---|---|
| Configure specialties, rubrics, levels, bands, policies | ✓ | – | – | – |
| Manage users, roles | ✓ | – | – | – |
| Assess candidates, review assessments (own scope) | ✓ | ✓ | – | – |
| Verify evidence (own scope) | ✓ | ✓ | – | – |
| See salary/compensation | ✓ | only with `compensation:read` | own only | – |
| Approve rewards / promotions | ✓ | with permission | – | – |
| Submit evidence, appeal, view own results | – | – | ✓ | – |
| Take assigned assessment | – | – | – | ✓ (tokenized link) |
| Audit log | ✓ | – | – | – |

Candidate links: random token (hashed in DB), single candidate, expiry (default 72h), revocable. Candidate result visibility follows an org-configured policy (default: completion confirmation only).

Write an integration test for every row of this table (allowed and forbidden).

---

## 5. AI layer

- `AiProvider` interface in `apps/api`; implementations: `AnthropicProvider` (key from env, server-side only) and `MockProvider` (deterministic, default in dev and tests).
- All prompts live in versioned files on the server. Every AI output is validated with a Zod schema before use; invalid output → error state, not partial data.
- Each AI run stores: purpose, prompt version, model id, rubric version, input hash, output, status, latency. Never store or send secrets.
- **Data minimization:** send pseudonymous IDs instead of names; never send passport data, PINFL, phone numbers, passwords, OTPs or e-signature data.
- AI may: draft assessment questions/scenarios (human must approve before use), summarize evidence, explain scores, suggest skill gaps and learning activities, suggest a score for subjective criteria.
- Every AI recommendation shows: criterion, supporting evidence references, reasoning summary, evidence coverage (e.g. "4 of 6 criteria have verified evidence"), limitations, suggested next step. If evidence is insufficient, say so — never fill gaps.
- Do not invent official government procedures. Questions about procedures must be grounded in reference documents uploaded by the organization.
- If the provider fails, all non-AI features keep working; show a clear error with a retry.
- Never execute code, SQL or commands produced by AI.

---

## 6. UI, i18n, themes, accessibility

**Design direction.** Calm, data-dense professional tool, not a marketing site. One accent color, neutral surfaces, semantic tokens (surface, text, border, focus, status, chart-1..6) defined as CSS variables for light and dark. Small fixed type scale and spacing scale. Tables are first-class (readable 14px, sticky header, sorting, filtering, pagination). No emoji as icons, no decorative gradients/blobs, no glassmorphism, no fake activity, no buttons that do nothing.

Build a `/dev/ui` page (dev only) that shows every shared component in all states in both themes — use it to verify consistency.

**Shared components:** app shell (collapsible sidebar, mobile drawer), header with language + theme selectors, breadcrumbs, page header with actions, data table, filters (search, select, date range), tabs, dialog, drawer, confirm dialog, toast, form fields with errors, skeletons, empty state, error-with-retry, status badge (icon + text, never color only), KPI tile, score breakdown, competency chart, audit timeline.

**i18n:** Uzbek (Latin) default, Russian, English. No hardcoded UI strings. Locale-aware dates, numbers and `UZS` currency. User preference persisted. Add a test that fails if any key is missing in any locale. Uzbek must read naturally (use "Siz" form). User-generated content is not translated. Language never affects calculations.

**Themes:** light, dark, system; persisted; no flash; check every page and chart in both.

**Accessibility:** keyboard navigation, visible focus, labelled inputs, accessible dialogs/menus, WCAG AA contrast, `prefers-reduced-motion`, live regions for async status. Mobile gets a deliberately simplified layout; wide tables become card lists or scroll inside their container, never the page.

---

## 7. MVP scope

**In the MVP**
- Auth (login, logout, forgot/reset password via Mailer, session expiry), RBAC, audit log.
- Org units, users, employees, positions, specialties, competencies, career levels, salary bands.
- Rubric builder with versioning, weight validation, preview.
- Candidate flow: create candidate → assign assessment → tokenized link → candidate answers (multiple choice auto-scored, written/practical answers human-scored with optional AI suggestion) → report → human decision.
- Employee flow: evidence submission → verification → period assessment → AI explanation → manager review → approval → employee view → appeal.
- Promotion recommendation with gate checks.
- Monthly periods, ranking, reward policy, reward recommendations, approval, paid mark.
- Role-aware dashboards with honest empty states.
- CSV import of employees and service records (with validation report and dedupe).
- CRM adapter **interface** + mock adapter + sync status page showing `Not configured`.
- In-app notifications for: assessment assigned, review needed, evidence verified/rejected, reward approved, appeal updated.

**Deferred (document, don't build)**
- Real CRM adapter (needs real API docs).
- Command palette, data exports beyond CSV, advanced analytics.
- Email notifications (only password reset email in MVP).
- Payroll/payout integration.

---

## 8. Phases and exit criteria

Report at the end of each phase (format in §12).

**Phase 1 — Audit & spec** → `docs/PRD.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md` (ERD + constraints + indexes), `SCORING_MODEL.md` (with worked numeric examples), `SECURITY.md`, `IMPLEMENTATION_PLAN.md`, `OPEN_QUESTIONS.md`.
*Exit:* docs written. **STOP for my review.**

**Phase 2 — Foundation** → monorepo, docker-compose Postgres, Prisma schema + migrations, auth + sessions, RBAC, audit log, design tokens, themes, i18n, app shell, `/dev/ui`.
*Exit:* login works in 3 languages and 2 themes; RBAC tests pass; `pnpm lint typecheck test` green.

**Phase 3 — Configuration** → org units, positions, specialties, competencies, levels, salary bands, rubric builder with versioning.
*Exit:* admin can create a specialty with a valid rubric; invalid weights are rejected (unit + API tests).

**Phase 4 — Employee assessment** → evidence, verification, period assessment, deterministic scoring, review, appeal, promotion gates.
*Exit:* E2E: employee submits evidence → manager verifies → assessment calculated → approved → employee sees result → appeals.

**Phase 5 — Candidate assessment** → tokenized links, question types, auto-scoring, human scoring, report, salary recommendation, hiring decision.
*Exit:* E2E: manager invites → candidate completes → manager reviews → decision recorded.

**Phase 6 — AI** → provider abstraction, question drafting with approval, explanations, skill gaps, development plan suggestions, failure handling.
*Exit:* all AI features work with `MockProvider`; invalid AI output and provider failure are tested.

**Phase 7 — Rankings & rewards** → periods, cohort ranking, policies, recommendations, approval, budget report.
*Exit:* duplicate reward prevented (test); ranking never mixes specialties (test).

**Phase 8 — CRM readiness & import** → adapter interface, mapping layer, idempotent sync job, mock adapter tests, CSV import.
*Exit:* re-importing the same file creates zero duplicates (test).

**Phase 9 — Hardening** → full E2E suite, mobile and theme checks, accessibility pass (axe in Playwright), docs and setup instructions.
*Exit:* Definition of Done (§10) satisfied.

---

## 9. Seed data

`pnpm db:seed` creates a demo org with every record flagged `isDemo = true` and a visible "Demo data" banner in the UI:
- 3 specialties with sample rubrics: Government services operator, Customer support, Sales.
- 4 example levels (Junior, Middle, Senior, Lead) — marked `UNAPPROVED`.
- Sample salary bands and reward policy — marked `UNAPPROVED`, values obviously illustrative.
- One user per role with credentials printed to the console (dev only).

`pnpm db:seed:clear-demo` removes all demo records.

---

## 10. Definition of Done

- Fresh clone → `docker compose up -d && pnpm i && pnpm db:migrate && pnpm db:seed && pnpm dev` works as documented.
- All main role workflows work end to end; `pnpm lint typecheck test test:e2e` pass.
- Scores are deterministic, reproducible from stored rubric versions, and unit-tested with worked examples.
- AI output is visibly distinct from human-approved decisions.
- Backend enforces every permission; audit log records every sensitive change.
- 3 languages complete (missing-key test passes), light/dark/system themes, responsive, axe has no serious violations.
- CRM status honestly shows `Not configured`. No secrets committed.

---

## 11. Do not invent — log in `OPEN_QUESTIONS.md` and use configurable placeholders

- Real salary bands, reward budget, reward formula, promotion rules.
- Which CRM is used, its API, field names, auth method.
- Which revenue fields are official.
- Candidate result visibility policy.
- Data retention periods for candidates, evidence and assessments (default placeholder: candidates 12 months, then anonymize).
- Hosting location: Uzbekistan's personal data law may require citizens' personal data to be stored on servers located in Uzbekistan, and sending data to a foreign AI API may count as cross-border transfer. Flag this for legal review; design so the DB can be hosted in-country and AI calls are pseudonymized. Do not claim compliance.

---

## 12. Phase report format

1. Implemented (short list).
2. Key files/modules changed.
3. Commands run and their real output summary (pass/fail counts).
4. Known limitations and open questions.
5. Next tasks.

---

Start now with Phase 1: audit the repository.
