# Scoring Model — Orbita

Status: Draft for review · Phase 1
Reference implementation: [`examples/scoring-reference.mjs`](./examples/scoring-reference.mjs) (`node docs/examples/scoring-reference.mjs`). Every number in this document is printed by that script. Phase 2 ports it into `packages/domain`, and the unit tests must reproduce these numbers exactly.

> All rubrics, weights, thresholds, salary bands and budgets in this document are **illustrative examples (UNAPPROVED)**. They demonstrate the mechanics, not company policy.

## 1. Units and rounding

| Quantity | Unit | Example |
|---|---|---|
| Score | integer hundredths, 0–10000 | `81.97` ↔ `8197` |
| Weight | basis points, sum 10000 | `30 %` ↔ `3000` |
| Money | whole UZS (`BigInt`) | `6 000 000` |

- `divHalfUp(n, d) = (2n + d) div (2d)` for non-negative integers.
- **Rounding happens once per stored number:** a metric-derived criterion score is rounded once when computed; the total is computed exactly from stored criterion scores and rounded once. No intermediate rounding.
- Money is rounded **down** to the policy step for rewards (never exceeding the budget or cap) and **half-up** to the step for salary range bounds.

## 2. Three kinds of assessment, one engine

| Kind | Subject | Rubric purpose | Used for |
|---|---|---|---|
| `CANDIDATE` | candidate | CANDIDATE | candidate report, starting level, salary range |
| `PERFORMANCE` | employee + period | PERFORMANCE | monthly result, ranking, rewards |
| `LEVEL_REVIEW` | employee | LEVEL_REVIEW | promotion eligibility (competency evidence over time) |

Monthly performance **never** changes the career level by itself. Promotion eligibility uses `LEVEL_REVIEW` assessments; monthly results may be shown alongside as context.

## 3. Criterion scoring methods

| Method | Source | Formula |
|---|---|---|
| `AUTO_QUIZ` | multiple-choice answers | `earnedPoints / maxPoints × 100`. A question counts as correct only on an exact set match (no partial credit by default). |
| `MANUAL` | human evaluator | evaluator enters 0–100. AI may suggest; both values stored; `finalScore = humanScore`. |
| `EVIDENCE_METRIC` | verified evidence only | per `metricConfig`: `ratio` (value ÷ target, capped at 100) or `linear` (0 at floor → 100 at target, clamped). |

Metric configs (validated by Zod in `contracts`):

```ts
type MetricConfig =
  | { kind: "ratio";  measure: Measure; target: bigint }                          // e.g. serviceFee sum vs target
  | { kind: "linear"; measure: Measure; floor: Fraction; target: Fraction };      // e.g. accuracy 90 % → 99 %
type Measure =
  | { op: "sum"; field: "serviceFee" | "quantity"; types: EvidenceType[] }        // governmentFee is not selectable
  | { op: "weightedCount"; types: EvidenceType[]; weightsByTier: Record<string, number> }
  | { op: "ratio"; numerator: Filter; denominator: Filter }                       // e.g. error-free / all records
  | { op: "avg"; metric: "csat"; types: ["CUSTOMER_FEEDBACK"] };
```

`governmentFee` is deliberately **not** a selectable field: it cannot be used in any revenue measure by construction.

## 4. Assessment total

```
validate: Σ weightBp (all criteria of the version) = 10000                → else INVALID_RUBRIC
for each criterion with evidenceRequired: verified count ≥ minEvidenceCount → else INCOMPLETE (list have/need/pending)
every applicable criterion has a finalScore                                 → else INCOMPLETE (list unscored)
not-applicable criteria allowed only if version.allowRenormalization       → else INVALID
total = divHalfUp( Σ finalScore_i × weightBp_i , Σ weightBp_i )   over applicable criteria
gates  = for each isGate criterion: finalScore ≥ gateMinScore
```

An `INCOMPLETE` or `INVALID` assessment cannot be submitted for approval. The UI shows exactly which criteria and how much evidence are missing.

## 5. Worked examples

### EX1 — Customer support, monthly performance

| Criterion | Method | Inputs (verified only) | Score | Weight |
|---|---|---|---|---|
| Service quality | linear 90 %→99 % on error-free ratio | 403 error-free of 412 records | `(403·10000 − 9000·412)·10000 / (900·412)` = 8683.93 → **86.84** | 30 % |
| Customer satisfaction | linear 3.00→4.80 on avg CSAT | average 4.52 from 64 responses (min 30 required) | `(452−300)/(480−300)` → **84.44** | 20 % |
| Volume × complexity | ratio vs 600 points | 280×tier1(1) + 90×tier2(2) + 42×tier3(3) = 586 | 586/600 → **97.67** | 20 % |
| Learning new services | manual | AI suggested 75.00; manager set 70.00 | **70.00** | 15 % |
| Knowledge sharing | manual | 2 documented sessions | **60.00** | 15 % |

`8684·3000 + 8444·2000 + 9767·2000 + 7000·1500 + 6000·1500 = 81 974 000` → `/10000` → **81.97**

### EX2 — Rounding once
Weights 3334 / 3333 / 3333, scores 87.33 / 91.17 / 78.05 → numerator 85 516 848 → 8551.6848 → **85.52**.

### EX3 — Invalid rubric
Weights 40 % + 35 % + 20 % = 95 % → `rubric.weightsMustSumTo100`, `diffBp = 500`. The version cannot be activated; the editor shows "5.00 % missing".

### EX4 — Incomplete
Mentoring requires ≥ 2 verified evidence items; the employee has 1 verified and 1 pending → `INCOMPLETE` with `{ key: mentoring, have: 1, need: 2, pending: 1 }`. No total is shown as final.

### EX5 — Not-applicable with renormalization
Weights 40/30/30, third criterion (new customer acquisition) not applicable this month, version allows renormalization:
`(8000·4000 + 9000·3000) / 7000 = 8428.57` → **84.29**. With renormalization not allowed the same input is `INVALID`.

### EX6 — Revenue counts only `serviceFee`

| Record | Status | serviceFee | governmentFee |
|---|---|---|---|
| S-101 | VERIFIED | 4 200 000 | 18 000 000 |
| S-102 | VERIFIED | 5 100 000 | 0 |
| S-103 | VERIFIED | 3 300 000 | 22 000 000 |
| S-104 | SUBMITTED | 2 000 000 | 0 |
| S-105 | REJECTED | 1 500 000 | 0 |

Counted: 12 600 000 vs target 15 000 000 → **84.00**. The 2 000 000 pending is shown as "pending, not counted". The 40 000 000 government fees never count.

### EX7 — Candidate: Government services operator

| Criterion | Method | Result | Weight |
|---|---|---|---|
| Professional knowledge | quiz, 16/20 | 80.00 | 35 % |
| Procedure accuracy | practical task, human | 75.00 | 25 % |
| Customer communication | scenario, AI 78.00 → human | 82.00 | 20 % |
| Data privacy awareness | quiz 9/10, **gate ≥ 80.00** | 90.00 ✓ | 20 % |

Total `81 150 000 / 10000` → **81.15**.

Starting level (example levels: Junior ≥ 0 + privacy gate 80; Middle ≥ 70 + procedure gate 70; Senior ≥ 85 + procedure gate 85; Lead ≥ 92):
Junior ✓ → Middle ✓ → Senior ✗ (total 81.15 < 85 and procedure 75 < 85) → **recommended: Middle**.

Salary (example band Middle: 5 000 000 – 7 000 000 UZS):
- progress inside the level = (81.15 − 70.00) / (85.00 − 70.00) = 1115/1500
- point = 5 000 000 + 2 000 000 × 1115/1500 = **6 486 667**
- range = point ± 10 % of band width (200 000), rounded to 1 000 → **6 287 000 – 6 687 000 UZS**
- If no approved band exists: "Salary band not configured" — no number is shown.

### EX8 — Promotion gate
Requirements are cumulative up to the target level.
- Middle → Senior, total 91.20, procedure 93.00, **privacy 72.00** → not eligible: failed gate privacy (needs 80.00). The current level stays Middle.
- Total 86.10, procedure 87.00, privacy 88.00 → eligible; a human still approves.

### EX9 — Ranking
Cohort = Customer support · rubric v1 · 2026-09 (approved assessments only):
`EMP-a1 88.10 #1 · EMP-b2 85.00 #2 · EMP-c3 85.00 #2 · EMP-d4 79.40 #4 · EMP-e5 71.20 #5`.
A cohort of 2 → `cohort.tooSmall`: scores shown, no rank. Different specialties or rubric versions are never in one cohort.

### EX10 — Rewards
Policy: budget 6 000 000, threshold 75.00, step 1 000, share ∝ (score − threshold). Excess: 13.10 / 10.00 / 10.00 / 4.40 = 37.50; EMP-e5 (71.20) ineligible.

| Variant | a1 | b2 | c3 | d4 | Unallocated |
|---|---|---|---|---|---|
| cap 2 500 000 | 2 096 000 | 1 600 000 | 1 600 000 | 704 000 | 0 |
| cap 2 000 000, no redistribution (default) | 2 000 000 | 1 600 000 | 1 600 000 | 704 000 | 96 000 |
| cap 2 000 000, redistribute | 2 000 000 | 1 639 000 | 1 639 000 | 721 000 | 1 000 |

Amounts never exceed the budget or the cap; the unallocated remainder is reported, not hidden.

## 6. Ranking rules
- Cohort key: `(specialtyId, rubricVersionId, periodId)`; only `APPROVED` assessments.
- Competition ranking ("1, 2, 2, 4"); ties broken only for display order by pseudonym, never for rank.
- `minCohort` default 3 (org setting).
- Every row shows components, verified vs pending evidence count, and status.

## 7. Reward rules
- Eligibility: approved performance assessment in the policy's cohort and `total ≥ threshold`. Further eligibility rules (e.g. no open disciplinary case) are open questions, not invented.
- Allocation: proportional to excess over threshold, per-person cap, rounded down to step; optional redistribution of capped remainder (policy flag).
- Generated as `PROPOSED`; approval and paid-mark are separate human actions. Unique (employee, period, policy).

## 8. Salary recommendation rules
- Input: position, recommended or proposed level, approved band effective on the decision date, assessment total, level thresholds.
- Output: point, range (± `spreadBp` of width, default 10 %), formula trace, missing data list.
- Never uses market data. Never changes payroll. Promotion salary review and monthly bonus are separate records.

## 9. AI's place in scoring
- AI output may fill `aiSuggestedScore` and a rationale for `MANUAL` criteria only.
- `finalScore` is always written by a human action (accept = copy suggestion with the human as `scoredById`).
- Totals, gates, ranks, rewards and salary are computed only by `packages/domain`.

## 10. Reproducibility
`calcSnapshot` stores inputs, criteria, weights, method configs, evidence ids, intermediate values, result and `calcVersion`. A test re-runs every stored snapshot of the current `calcVersion` and asserts identical output.
