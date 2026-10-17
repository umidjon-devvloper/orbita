# Orbita (working name)

Employee assessment, career leveling, candidate evaluation, compensation recommendation and rewards platform.

**Status:** Phase 1 (spec) done · Phase 2: tooling, domain engine and database (schema, migrations, DB-level constraints) done. API routes and web app not started yet.

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
```

`pnpm test` runs unit tests only; `pnpm test:db` runs database tests (recreates the `*_test` database).
No access to binaries.prisma.sh? See "Migration tooling" in `docs/DATABASE_DESIGN.md`.
