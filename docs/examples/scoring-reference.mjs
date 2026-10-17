// Reference implementation of the formulas in docs/SCORING_MODEL.md.
// Pure integer (BigInt) math, no floats. Phase 2 ports this into packages/domain;
// its unit tests must reproduce exactly the numbers this script prints.
// Run: node docs/examples/scoring-reference.mjs
// All rubric values, thresholds, bands and budgets below are ILLUSTRATIVE (UNAPPROVED).

const H = 10000n; // 100.00 in hundredths

/** n / d rounded half-up (n >= 0, d > 0) */
export const divHalfUp = (n, d) => (2n * n + d) / (2n * d);
/** n / d rounded down */
export const divFloor = (n, d) => n / d;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const fmt = (h) => `${h / 100n}.${String(h % 100n).padStart(2, "0")}`;
export const som = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " UZS";

// ───────────── Criterion metrics (each rounded once to hundredths) ─────────────

/** value = num/den; floor & target given as integers on scale S. Linear 0..100 between them. */
export function linearScore(num, den, floorS, targetS, S) {
  const n = num * S - floorS * den;
  if (n <= 0n) return 0n;
  return clamp(divHalfUp(n * H, (targetS - floorS) * den), 0n, H);
}

/** value / target capped at 100 */
export const ratioScore = (value, target) => clamp(divHalfUp(value * H, target), 0n, H);

/** multiple choice: exact-set match per question, no partial credit (default) */
export function quizScore(answers) {
  const earned = answers.reduce((s, a) => s + (a.correct ? a.points : 0n), 0n);
  const max = answers.reduce((s, a) => s + a.points, 0n);
  return divHalfUp(earned * H, max);
}

// ───────────── Rubric validation ─────────────

export function validateWeights(criteria) {
  const sum = criteria.reduce((s, c) => s + c.weightBp, 0n);
  return sum === H
    ? { ok: true }
    : { ok: false, code: "rubric.weightsMustSumTo100", sumBp: sum, diffBp: H - sum };
}

// ───────────── Assessment total ─────────────

export function computeTotal(criteria, { allowRenormalization = false } = {}) {
  const w = validateWeights(criteria);
  if (!w.ok) return { status: "INVALID_RUBRIC", ...w };
  const missing = criteria.filter((c) => c.evidenceRequired && c.verifiedEvidence < c.minEvidenceCount);
  if (missing.length)
    return {
      status: "INCOMPLETE",
      missing: missing.map((c) => ({
        key: c.key,
        have: c.verifiedEvidence,
        need: c.minEvidenceCount,
        pending: c.pendingEvidence ?? 0,
      })),
    };
  const unscored = criteria.filter((c) => !c.notApplicable && c.score == null);
  if (unscored.length) return { status: "INCOMPLETE", unscored: unscored.map((c) => c.key) };
  const na = criteria.filter((c) => c.notApplicable);
  if (na.length && !allowRenormalization)
    return { status: "INVALID", code: "assessment.notApplicableNotAllowed" };
  const used = criteria.filter((c) => !c.notApplicable);
  const weightSum = used.reduce((s, c) => s + c.weightBp, 0n);
  const numerator = used.reduce((s, c) => s + c.score * c.weightBp, 0n);
  const total = divHalfUp(numerator, weightSum);
  const gates = criteria
    .filter((c) => c.isGate)
    .map((c) => ({ key: c.key, min: c.gateMin, score: c.score, passed: c.score >= c.gateMin }));
  return { status: "COMPLETE", numerator, weightSum, total, gates };
}

// ───────────── Level eligibility ─────────────

/** levels sorted by rank ascending. Returns highest level whose total threshold and all gate requirements pass. */
export function eligibleLevel(levels, total, competencyScores) {
  let best = null;
  const trace = [];
  for (const L of levels) {
    const failed = (L.requirements ?? []).filter((r) => (competencyScores[r.competency] ?? -1n) < r.min);
    const gateFailed = failed.filter((r) => r.isGate);
    const ok = total >= L.minTotal && gateFailed.length === 0;
    trace.push({
      level: L.key,
      minTotal: L.minTotal,
      totalOk: total >= L.minTotal,
      failed: failed.map((r) => `${r.competency}${r.isGate ? " (gate)" : ""}`),
    });
    if (ok) best = L.key;
    else break; // levels are cumulative: stop at first failure
  }
  return { level: best, trace };
}

/** Promotion check for one target level. Requirements are cumulative (all levels up to target).
 *  Never lowers the current level — a failed check only means "not yet eligible". */
export function checkPromotion(levels, targetKey, total, competencyScores) {
  const idx = levels.findIndex((l) => l.key === targetKey);
  const target = levels[idx];
  const reqs = new Map();
  for (const L of levels.slice(0, idx + 1))
    for (const r of L.requirements ?? []) {
      const prev = reqs.get(r.competency);
      if (!prev || r.min > prev.min)
        reqs.set(r.competency, { ...r, isGate: r.isGate || (prev?.isGate ?? false) });
    }
  const failedGates = [...reqs.values()]
    .filter((r) => r.isGate && (competencyScores[r.competency] ?? -1n) < r.min)
    .map((r) => ({ competency: r.competency, min: r.min, score: competencyScores[r.competency] ?? null }));
  const totalOk = total >= target.minTotal;
  return {
    target: targetKey,
    eligible: totalOk && failedGates.length === 0,
    totalOk,
    minTotal: target.minTotal,
    failedGates,
  };
}

// ───────────── Ranking (competition ranking 1,2,2,4) ─────────────

export function rankCohort(rows, minCohort = 3) {
  if (rows.length < minCohort) return { ranked: false, reason: "cohort.tooSmall", rows };
  const sorted = [...rows].sort((a, b) =>
    b.total > a.total ? 1 : b.total < a.total ? -1 : a.id.localeCompare(b.id),
  );
  let rank = 0;
  return {
    ranked: true,
    rows: sorted.map((r, i) => {
      if (i === 0 || r.total !== sorted[i - 1].total) rank = i + 1;
      return { ...r, rank };
    }),
  };
}

// ───────────── Rewards ─────────────

export function allocateRewards({ budget, threshold, cap, step, redistribute }, rows) {
  const eligible = rows.filter((r) => r.approved && r.total >= threshold);
  const excess = (r) => r.total - threshold;
  let out = new Map(eligible.map((r) => [r.id, 0n]));
  let remaining = budget;
  let pool = eligible.filter((r) => excess(r) > 0n);
  for (let round = 0; round < (redistribute ? 10 : 1) && pool.length && remaining >= step; round++) {
    const totalExcess = pool.reduce((s, r) => s + excess(r), 0n);
    let spent = 0n;
    const next = [];
    for (const r of pool) {
      const raw = divFloor(remaining * excess(r), totalExcess);
      const room = cap - out.get(r.id);
      let amt = raw < room ? raw : room;
      amt = (amt / step) * step; // round down to step: never exceed budget or cap
      out.set(r.id, out.get(r.id) + amt);
      spent += amt;
      if (out.get(r.id) < cap) next.push(r);
    }
    remaining -= spent;
    if (spent === 0n) break;
    pool = next;
  }
  return {
    allocations: [...out.entries()].map(([id, amount]) => ({ id, amount })),
    unallocated: remaining,
    ineligible: rows.filter((r) => !eligible.includes(r)).map((r) => r.id),
  };
}

// ───────────── Salary ─────────────

/** Position within band by progress between the level's entry threshold and the next level's. */
export function recommendSalary({ band, total, levelMin, nextLevelMin, spreadBp = 1000n, step = 1000n }) {
  if (!band) return { status: "NO_BAND", code: "salary.bandNotConfigured" };
  const width = band.max - band.min;
  const progressNum = clamp(total - levelMin, 0n, nextLevelMin - levelMin);
  const progressDen = nextLevelMin - levelMin;
  const point = band.min + divHalfUp(width * progressNum, progressDen);
  const spread = divHalfUp(width * spreadBp, H);
  const roundStep = (x) => divHalfUp(x, step) * step;
  const lo = clamp(roundStep(point - spread), band.min, band.max);
  const hi = clamp(roundStep(point + spread), band.min, band.max);
  return { status: "OK", point, lo, hi, progress: `${progressNum}/${progressDen}` };
}

// ═════════════════════════════ Worked examples ═════════════════════════════
if (import.meta.url === `file://${process.argv[1]}`) {
  const line = (s = "") => console.log(s);

  line("EX1 Customer support — monthly performance (demo rubric v1)");
  const quality = linearScore(403n, 412n, 9000n, 9900n, H); // 403 of 412 records error-free; 90% → 99%
  const csat = linearScore(452n, 100n, 300n, 480n, 100n); // avg 4.52 on 1–5; 3.00 → 4.80
  const points = 280n * 1n + 90n * 2n + 42n * 3n; // complexity-weighted tickets
  const volume = ratioScore(points, 600n);
  line(`  quality ${fmt(quality)} | csat ${fmt(csat)} | volume points ${points} → ${fmt(volume)}`);
  const ex1 = computeTotal([
    {
      key: "quality",
      weightBp: 3000n,
      score: quality,
      evidenceRequired: true,
      minEvidenceCount: 1n,
      verifiedEvidence: 412n,
    },
    {
      key: "csat",
      weightBp: 2000n,
      score: csat,
      evidenceRequired: true,
      minEvidenceCount: 30n,
      verifiedEvidence: 64n,
    },
    { key: "volume", weightBp: 2000n, score: volume },
    { key: "learning", weightBp: 1500n, score: 7000n }, // AI suggested 75.00, manager set 70.00
    { key: "sharing", weightBp: 1500n, score: 6000n },
  ]);
  line(`  numerator ${ex1.numerator} / ${ex1.weightSum} → total ${fmt(ex1.total)}`);

  line("\nEX2 Rounding with uneven weights");
  const ex2 = computeTotal([
    { key: "a", weightBp: 3334n, score: 8733n },
    { key: "b", weightBp: 3333n, score: 9117n },
    { key: "c", weightBp: 3333n, score: 7805n },
  ]);
  line(`  numerator ${ex2.numerator} / 10000 = ${Number(ex2.numerator) / 10000} → ${fmt(ex2.total)}`);

  line("\nEX3 Invalid weights");
  line(
    "  " +
      JSON.stringify(
        validateWeights([{ weightBp: 4000n }, { weightBp: 3500n }, { weightBp: 2000n }]),
        (k, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
  );

  line("\nEX4 Incomplete — required evidence missing");
  const ex4 = computeTotal([
    { key: "quality", weightBp: 5000n, score: 8000n },
    {
      key: "mentoring",
      weightBp: 5000n,
      score: null,
      evidenceRequired: true,
      minEvidenceCount: 2n,
      verifiedEvidence: 1n,
      pendingEvidence: 1n,
    },
  ]);
  line("  " + JSON.stringify(ex4, (k, v) => (typeof v === "bigint" ? v.toString() : v)));

  line("\nEX5 Not-applicable criterion with renormalization allowed");
  const ex5 = computeTotal(
    [
      { key: "a", weightBp: 4000n, score: 8000n },
      { key: "b", weightBp: 3000n, score: 9000n },
      { key: "acq", weightBp: 3000n, notApplicable: true, score: null },
    ],
    { allowRenormalization: true },
  );
  line(
    `  ${ex5.numerator} / ${ex5.weightSum} → ${fmt(ex5.total)}  (same input without permission → ${
      computeTotal([
        { key: "a", weightBp: 4000n, score: 8000n },
        { key: "b", weightBp: 3000n, score: 9000n },
        { key: "acq", weightBp: 3000n, notApplicable: true, score: null },
      ]).status
    })`,
  );

  line("\nEX6 Sales revenue criterion — only verified serviceFee counts");
  const sales = [
    { id: "S-101", status: "VERIFIED", serviceFee: 4_200_000n, governmentFee: 18_000_000n },
    { id: "S-102", status: "VERIFIED", serviceFee: 5_100_000n, governmentFee: 0n },
    { id: "S-103", status: "VERIFIED", serviceFee: 3_300_000n, governmentFee: 22_000_000n },
    { id: "S-104", status: "SUBMITTED", serviceFee: 2_000_000n, governmentFee: 0n },
    { id: "S-105", status: "REJECTED", serviceFee: 1_500_000n, governmentFee: 0n },
  ];
  const revenue = sales.filter((s) => s.status === "VERIFIED").reduce((a, s) => a + s.serviceFee, 0n);
  const revScore = ratioScore(revenue, 15_000_000n);
  line(
    `  verified serviceFee ${som(revenue)} vs target ${som(15_000_000n)} → ${fmt(revScore)}; pending ${som(2_000_000n)} shown separately; governmentFee ignored`,
  );

  line("\nEX7 Candidate — Government services operator (candidate rubric v1)");
  const quiz = quizScore(Array.from({ length: 20 }, (_, i) => ({ points: 1n, correct: i < 16 })));
  const privacy = quizScore(Array.from({ length: 10 }, (_, i) => ({ points: 1n, correct: i < 9 })));
  const ex7 = computeTotal([
    { key: "knowledge", weightBp: 3500n, score: quiz },
    { key: "procedure", weightBp: 2500n, score: 7500n }, // practical task, human-scored
    { key: "communication", weightBp: 2000n, score: 8200n }, // scenario, AI suggested 78.00 → human 82.00
    { key: "privacy", weightBp: 2000n, score: privacy, isGate: true, gateMin: 8000n },
  ]);
  line(
    `  knowledge ${fmt(quiz)} privacy ${fmt(privacy)} → total ${fmt(ex7.total)}; gates ${JSON.stringify(ex7.gates, (k, v) => (typeof v === "bigint" ? fmt(v) : v))}`,
  );
  const levels = [
    { key: "junior", minTotal: 0n, requirements: [{ competency: "privacy", min: 8000n, isGate: true }] },
    { key: "middle", minTotal: 7000n, requirements: [{ competency: "procedure", min: 7000n, isGate: true }] },
    { key: "senior", minTotal: 8500n, requirements: [{ competency: "procedure", min: 8500n, isGate: true }] },
    { key: "lead", minTotal: 9200n, requirements: [] },
  ];
  const lv = eligibleLevel(levels, ex7.total, {
    privacy,
    procedure: 7500n,
    knowledge: quiz,
    communication: 8200n,
  });
  line(
    `  starting level → ${lv.level}; trace ${JSON.stringify(lv.trace, (k, v) => (typeof v === "bigint" ? fmt(v) : v))}`,
  );
  const sal = recommendSalary({
    band: { min: 5_000_000n, max: 7_000_000n },
    total: ex7.total,
    levelMin: 7000n,
    nextLevelMin: 8500n,
  });
  line(
    `  salary (band Middle 5 000 000–7 000 000): point ${som(sal.point)}, range ${som(sal.lo)} – ${som(sal.hi)}, progress ${sal.progress}`,
  );

  line("\nEX8 Promotion Middle → Senior blocked by a gate");
  const bf = (k, v) => (typeof v === "bigint" ? fmt(v) : v);
  const ex8 = checkPromotion(levels, "senior", 9120n, { privacy: 7200n, procedure: 9300n });
  line(`  total 91.20, procedure 93.00, privacy 72.00 → ${JSON.stringify(ex8, bf)}`);
  const ex8b = checkPromotion(levels, "senior", 8610n, { privacy: 8800n, procedure: 8700n });
  line(`  total 86.10, procedure 87.00, privacy 88.00 → ${JSON.stringify(ex8b, bf)}`);

  line("\nEX9 Ranking within one cohort (customer support, rubric v1, 2026-09)");
  const cohort = [
    { id: "EMP-a1", total: 8810n },
    { id: "EMP-b2", total: 8500n },
    { id: "EMP-c3", total: 8500n },
    { id: "EMP-d4", total: 7940n },
    { id: "EMP-e5", total: 7120n },
  ];
  line(
    "  " +
      rankCohort(cohort)
        .rows.map((r) => `${r.id} ${fmt(r.total)} #${r.rank}`)
        .join(" | "),
  );
  line("  cohort of 2 → " + rankCohort(cohort.slice(0, 2)).reason);

  line("\nEX10 Rewards — budget 6 000 000, threshold 75.00, step 1 000");
  const rows = cohort.map((r) => ({ ...r, approved: true }));
  const r1 = allocateRewards(
    { budget: 6_000_000n, threshold: 7500n, cap: 2_500_000n, step: 1000n, redistribute: false },
    rows,
  );
  line(
    "  cap 2 500 000: " +
      r1.allocations.map((a) => `${a.id} ${som(a.amount)}`).join(" | ") +
      ` | unallocated ${som(r1.unallocated)} | ineligible ${r1.ineligible}`,
  );
  const r2 = allocateRewards(
    { budget: 6_000_000n, threshold: 7500n, cap: 2_000_000n, step: 1000n, redistribute: false },
    rows,
  );
  line(
    "  cap 2 000 000, no redistribution: " +
      r2.allocations.map((a) => `${a.id} ${som(a.amount)}`).join(" | ") +
      ` | unallocated ${som(r2.unallocated)}`,
  );
  const r3 = allocateRewards(
    { budget: 6_000_000n, threshold: 7500n, cap: 2_000_000n, step: 1000n, redistribute: true },
    rows,
  );
  line(
    "  cap 2 000 000, redistribute: " +
      r3.allocations.map((a) => `${a.id} ${som(a.amount)}`).join(" | ") +
      ` | unallocated ${som(r3.unallocated)}`,
  );
}
