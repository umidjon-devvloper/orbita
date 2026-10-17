# Orbita (working name)

Employee assessment, career leveling, candidate evaluation, compensation recommendation and rewards platform.

**Status:** Phase 1 (spec) done · Phase 2.1 tooling and 2.2 domain engine done. API and web app not started yet.

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
corepack enable          # pnpm 10
pnpm install
pnpm run verify          # lint + format + typecheck + tests with 100 % domain coverage
pnpm test                # tests only
docker compose up -d     # Postgres 16 + Mailpit (needed from Phase 2.3)
```
