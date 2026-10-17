import { divFloor, min, sum } from "./math.js";
import { roundDownToStep, type Uzs } from "./money.js";
import { err, ok, type Result } from "./result.js";
import type { Score } from "./score.js";

export interface RewardPolicyConfig {
  readonly kind: "CASH" | "RECOGNITION";
  /** whole UZS for the policy's cohort and period (ignored for RECOGNITION) */
  readonly budget: Uzs;
  readonly threshold: Score;
  readonly cap: Uzs;
  readonly step: Uzs;
  /** re-share what capped people could not take (default false) */
  readonly redistribute: boolean;
}

export interface RewardCandidate {
  readonly id: string;
  readonly total: Score;
  readonly approved: boolean;
}

export interface RewardAllocation {
  readonly id: string;
  readonly excess: Score;
  readonly amount: Uzs | null;
  readonly capped: boolean;
}

export interface RewardOutcome {
  readonly allocations: readonly RewardAllocation[];
  readonly unallocated: Uzs;
  readonly ineligible: readonly { readonly id: string; readonly reason: "notApproved" | "belowThreshold" }[];
}

const MAX_ROUNDS = 10;

/**
 * Proportional-above-threshold allocation (illustrative default policy — UNAPPROVED until the owner confirms).
 * Amounts are rounded DOWN to `step`, so the sum never exceeds the budget and nobody exceeds the cap.
 */
export function allocateRewards(
  policy: RewardPolicyConfig,
  candidates: readonly RewardCandidate[],
): Result<RewardOutcome, "rewards.invalidPolicy"> {
  if (policy.step <= 0n || policy.cap < 0n || policy.budget < 0n) return err("rewards.invalidPolicy");

  const ineligible = candidates
    .filter((c) => !c.approved || c.total < policy.threshold)
    .map((c) => ({ id: c.id, reason: c.approved ? ("belowThreshold" as const) : ("notApproved" as const) }));
  const eligible = candidates.filter((c) => c.approved && c.total >= policy.threshold);
  const excess = (c: RewardCandidate): Score => c.total - policy.threshold;

  if (policy.kind === "RECOGNITION")
    return ok({
      allocations: eligible.map((c) => ({ id: c.id, excess: excess(c), amount: null, capped: false })),
      unallocated: 0n,
      ineligible,
    });

  // one mutable accumulator per eligible person (local to this pure function)
  const state = eligible.map((c) => ({ c, excess: excess(c), amount: 0n }));
  let remaining = policy.budget;
  let pool = state.filter((s) => s.excess > 0n);
  const rounds = policy.redistribute ? MAX_ROUNDS : 1;
  for (let round = 0; round < rounds && pool.length > 0; round++) {
    const totalExcess = sum(pool.map((s) => s.excess));
    let spent = 0n;
    for (const s of pool) {
      const share = divFloor(remaining * s.excess, totalExcess);
      const amount = roundDownToStep(min(share, policy.cap - s.amount), policy.step);
      s.amount += amount;
      spent += amount;
    }
    remaining -= spent;
    if (spent === 0n) break;
    pool = pool.filter((s) => s.amount < policy.cap);
  }

  return ok({
    allocations: state.map((s) => ({
      id: s.c.id,
      excess: s.excess,
      amount: s.amount,
      capped: s.amount >= policy.cap,
    })),
    unallocated: remaining,
    ineligible,
  });
}
