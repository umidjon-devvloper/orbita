# Progress

## Done
- **Phase 1 — Audit & spec** (2026-10-18)
  - Repository audit: empty → greenfield.
  - Docs: PRD, ARCHITECTURE, DATABASE_DESIGN, SCORING_MODEL, SECURITY, IMPLEMENTATION_PLAN, OPEN_QUESTIONS, DECISIONS.
  - `docs/schema.draft.prisma`: 46 models, 32 enums — valid (Prisma WASM validator 7.1 and 8.1).
  - `docs/examples/scoring-reference.mjs`: executable reference for EX1–EX10.

## In progress
- Waiting for owner review of Phase 1 (data model, scoring model, open questions).

## Next
- Phase 2.1 — workspace tooling, docker-compose, CI script.
- Phase 2.2 — port scoring reference to `packages/domain` with EX1–EX10 tests.
