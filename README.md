# Orbita (working name)

Employee assessment, career leveling, candidate evaluation, compensation recommendation and rewards platform.

**Status:** Phase 2 complete — tooling, domain engine, database, API skeleton, auth, RBAC + audit, and the Next.js web shell (design tokens, light/dark, uz/ru/en, login/forgot/reset, dashboard, 401/403, app shell with left rail). Phase 3 (configuration CRUD) next.

## Read first

- `CLAUDE.md` — standing rules for anyone (human or agent) working in this repo
- `docs/BUILD_PROMPT.md` — the build brief
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/SCORING_MODEL.md`, `docs/SECURITY.md`
- `docs/IMPLEMENTATION_PLAN.md`, `docs/OPEN_QUESTIONS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

## Try the scoring model

```bash
node docs/examples/scoring-reference.mjs
```

## Develop

```bash
corepack enable                       # pnpm 10
pnpm install
cp .env.example .env
docker compose up -d                  # Postgres 16 + Mailpit
pnpm db:generate                      # Prisma client
pnpm db:migrate                       # apply migrations to DATABASE_URL
pnpm run verify                       # lint + format + typecheck + unit (100 % domain coverage) + DB tests
pnpm --filter @orbita/api dev         # start the Fastify API on http://127.0.0.1:4000 (watch mode)
pnpm --filter @orbita/web dev         # start the Next.js web shell on http://127.0.0.1:3000
```

Health checks: `GET /api/v1/healthz` (process is up) · `GET /api/v1/readyz` (DB is reachable).
Login: open http://127.0.0.1:3000/uz/login, http://127.0.0.1:3000/ru/login or http://127.0.0.1:3000/en/login.

`pnpm test` runs unit tests only; `pnpm test:db` runs database tests (recreates the `*_test` database).
No access to binaries.prisma.sh? See "Migration tooling" in `docs/DATABASE_DESIGN.md`.
