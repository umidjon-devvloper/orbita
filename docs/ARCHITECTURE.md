# Architecture — Orbita

Status: Draft for review · Phase 1

## 1. Shape: modular monolith in a pnpm monorepo

```
orbita/
├─ apps/
│  ├─ web/            Next.js App Router (UI, server components, i18n routing)
│  └─ api/            Fastify REST API (/api/v1), Prisma, jobs worker
├─ packages/
│  ├─ domain/         Pure business logic (scoring, gates, ranking, rewards, salary, dedupe, state machines)
│  ├─ contracts/      Zod schemas + inferred TS types shared by web and api
│  ├─ i18n/           uz.json, ru.json, en.json + formatting helpers
│  └─ config/         shared tsconfig, eslint, prettier
├─ docs/
├─ docker-compose.yml Postgres 16 (+ mailpit for dev email)
└─ CLAUDE.md
```

Why a monolith: one team, one database, strong consistency needs (audit, approvals, money). Module boundaries are enforced by folder structure and ESLint import rules, not by network calls.

## 2. Dependency rule

```
web ──► contracts ◄── api ──► domain
          ▲                     ▲
          └───── i18n           └── (no deps except decimal-free integer math; no I/O)
```

- `domain` imports nothing from `api`, `web`, Prisma, Fastify or Node I/O. Input/output are plain typed objects. 100 % of business rules live here and are unit-tested.
- `contracts` holds request/response Zod schemas and enums. API validates with them; web forms reuse them.
- `api` orchestrates: authorize → load data via Prisma → call `domain` → persist in a transaction → write audit event → enqueue notifications.

## 3. API (apps/api)

```
src/
  app.ts                 Fastify instance, plugins
  plugins/               auth (session), csrf, rate-limit, error-handler, request-id, prisma
  modules/
    auth/                login, logout, me, password reset
    users/  roles/       admin user & role management
    org/                 org units, organization settings
    catalog/             specialties, positions, competencies
    levels/              career levels, level requirements
    rubrics/             rubrics, versions, criteria, questions
    compensation/        salary bands, compensation recommendations
    candidates/          candidates, invites, public assessment endpoints
    evidence/            evidence, attachments, verification
    assessments/         assessments, criterion results, review, appeals
    promotions/          recommendations, decisions, level history
    performance/         periods, rankings
    rewards/             policies, recommendations, approvals
    development/         development plan items
    ai/                  AiProvider, prompts/, runs
    integrations/        CrmAdapter, mappings, sync jobs, CSV import
    notifications/
    audit/
  jobs/                  Postgres job runner (SELECT … FOR UPDATE SKIP LOCKED)
  lib/                   storage, mailer, crypto, pagination
```

Each module: `routes.ts` (HTTP + Zod schemas from contracts) → `service.ts` (transaction, authorization checks, domain calls) → `repo.ts` (Prisma queries). No module reads another module's tables directly; it calls that module's service.

### Conventions
- Base path `/api/v1`. JSON only. IDs are UUIDv7 strings.
- Errors: RFC 9457 `application/problem+json` with `code` (stable machine key, also the i18n key), `title`, `status`, `errors[]` for field errors. No stack traces outside dev.
- Pagination: cursor-based `?cursor=&limit=` (max 100) for lists; total counts only where cheap.
- Money in JSON: string of whole UZS (`"6000000"`) to avoid JS number issues. Scores in JSON: string with 2 decimals (`"74.90"`).
- Every mutating endpoint: requires session + CSRF header, checks permission + scope, runs in a transaction, writes `AuditEvent` in the same transaction.
- Idempotency: `Idempotency-Key` header supported on create endpoints used by imports and the job runner.
- OpenAPI document generated from Zod at `/api/v1/docs` (dev/staging only).

## 4. Web (apps/web)

- App Router with locale segment: `/[locale]/...` where locale ∈ {uz, ru, en}; default `uz`. User's saved locale wins after login.
- Data fetching: server components call the API server-to-server with the user's session cookie forwarded; client mutations via a small typed fetch wrapper (contracts schemas) + TanStack Query for cache invalidation.
- Forms: React Hook Form + Zod resolver using `contracts` schemas; server errors mapped to fields by `errors[].path`.
- Theme: `next-themes` with `class` strategy and inline script → no flash. Tokens as CSS variables in `globals.css` for `:root` and `.dark`.
- Components: shadcn/ui primitives wrapped into `components/ui/*`; product components in `components/app/*` (DataTable, ScoreBreakdown, StatusBadge, EmptyState, AuditTimeline…).
- `/dev/ui` route only when `NODE_ENV !== 'production'`.

## 5. Authentication and sessions

1. `POST /auth/login` → verify Argon2id hash → create `Session` (random 32 bytes, stored as SHA-256 hash) → set cookie `orbita_sid` (`HttpOnly; Secure; SameSite=Lax; Path=/`), return CSRF token.
2. Same-origin: Next.js rewrites `/api/*` → Fastify, so the cookie is first-party.
3. Session lifetime: idle 30 min (sliding), absolute 12 h (configurable). Logout deletes the row.
4. CSRF: synchronizer token stored in the session row, sent by the client in `X-CSRF-Token` on non-GET requests.
5. Password reset: single-use token (hashed), 30-min expiry, all sessions revoked on reset. Response identical whether the email exists or not.
6. Rate limits: login 5/min per IP+email, reset 3/hour per email, candidate token endpoints 30/min per token.
7. Candidate access: separate tokenized routes under `/api/v1/public/assessments/:token/*`; no session; token scoped to one assessment.

## 6. Authorization

- `Permission` is a string key (catalogue in SECURITY.md). Roles bundle permissions. A user's role assignment has a **scope**: `ORG` or a specific `OrgUnit` (applies to its subtree).
- `can(user, permission, resource)` lives in `domain/authz` (pure): resource carries `orgUnitId` and `ownerEmployeeId`. API resolves the user's grants once per request.
- Self-approval guard (configurable rules): cannot verify own evidence, approve own assessment, approve own reward/promotion, or approve something one recommended.

## 7. Domain package (packages/domain)

```
scoring/      computeAssessment(), metric→score functions, rounding
rubric/       validateRubric(), weight math
gates/        evaluateLevelEligibility()
ranking/      rankCohort()
rewards/      allocateRewards()
salary/       recommendSalary()
evidence/     dedupeKey(), allocation checks
workflow/     state machines: assessment, evidence, promotion, reward, appeal
authz/        can()
money/        UZS integer helpers, roundToStep()
```
All functions are pure and total: invalid input returns a typed `Result<T, DomainError>` instead of throwing.

## 8. AI layer

```
interface AiProvider {
  generate<T>(req: { purpose: AiPurpose; promptVersion: string; input: unknown; schema: ZodSchema<T>; locale: Locale }): Promise<AiResult<T>>;
}
```
- `MockProvider` (default in dev/test, deterministic fixtures), `AnthropicProvider` (server-side key, model id from env).
- Pipeline: build pseudonymized input → render versioned prompt from `modules/ai/prompts/<purpose>/<version>.md` → call provider with timeout (30 s) → parse JSON → validate with Zod → store `AiRun` → return. Invalid output = `AiRun.status = INVALID_OUTPUT`, never partially used.
- AI runs are triggered as jobs; UI polls run status. Retry: max 2 automatic retries on transient errors, then manual retry button.
- Output language: requested locale; numbers/scores never come from AI except as an explicit `suggestedScore` that a human must accept.

## 9. Background jobs

`Job` table: `type, payload, status, runAt, attempts, maxAttempts, lockedAt, lockedBy, lastError, idempotencyKey (unique)`. Worker runs inside the api process (separate entrypoint possible later), polling with `FOR UPDATE SKIP LOCKED`. Exponential backoff. Job types: `ai.run`, `crm.sync`, `import.process`, `notifications.fanout`, `retention.sweep`.

## 10. CRM integration readiness

```
interface CrmAdapter {
  readonly provider: string;
  testConnection(): Promise<ConnectionStatus>;
  listStaff(cursor?): Promise<Page<CrmStaff>>;
  listServiceRecords(since: Date, cursor?): Promise<Page<CrmServiceRecord>>;
}
```
- `CrmStaff`, `CrmServiceRecord` are **internal** shapes. A per-provider mapper converts provider payloads to them — CRM field names never leak past the adapter.
- `ExternalMapping(connectionId, entityType, externalId) → internalId` guarantees idempotency; evidence uses `(orgId, source=CRM, externalId)` unique.
- Only `MockCrmAdapter` exists in MVP. `CrmConnection.status` = `NOT_CONFIGURED` until real docs/credentials exist.

## 11. Files

`Storage` interface (`put`, `getStream`, `delete`); `LocalDiskStorage` in dev; S3-compatible implementation later (must allow an in-country provider). Files referenced by `storageKey`; downloads go through `GET /api/v1/files/:id` with permission check; `Content-Disposition: attachment`; allowed types: pdf, png, jpg, webp, docx, xlsx, csv; max 10 MB.

## 12. Observability

pino JSON logs with `requestId`, `userId` (UUID only), route, latency; no emails, names, amounts or free text in logs. Health: `/healthz` (process), `/readyz` (DB). Errors captured with context-free messages.

## 13. Environments and configuration

`.env.example` documents: `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `BRAND_NAME`, `DEFAULT_LOCALE`, `AI_PROVIDER` (mock|anthropic), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `SMTP_*`, `STORAGE_DRIVER`, `STORAGE_DIR`, `TZ=Asia/Tashkent`. Config parsed once with Zod at startup; the process refuses to start on invalid config.

## 14. Testing strategy

| Layer | Tool | What |
|---|---|---|
| domain | Vitest | every rule + worked examples from SCORING_MODEL.md (table-driven) |
| api | Vitest + real Postgres (docker) | routes, permissions matrix, transactions, audit, idempotency |
| web | Vitest + Testing Library | critical components, i18n key completeness |
| e2e | Playwright | 12 journeys from the original brief + theme/locale/mobile smoke + axe |

CI order: `lint → typecheck → prisma validate → unit → integration → e2e`.
