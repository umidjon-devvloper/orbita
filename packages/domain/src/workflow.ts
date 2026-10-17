import { err, ok, type Result } from "./result.js";

/** Allowed transitions per workflow. Anything not listed is rejected server-side. */
export const WORKFLOWS = {
  assessment: {
    DRAFT: ["IN_PROGRESS"],
    IN_PROGRESS: ["SUBMITTED"],
    SUBMITTED: ["AI_ANALYZED", "UNDER_REVIEW"],
    AI_ANALYZED: ["UNDER_REVIEW"],
    UNDER_REVIEW: ["APPROVED", "REJECTED", "IN_PROGRESS"],
    APPROVED: ["APPEALED"],
    APPEALED: ["APPROVED", "REASSESSED"],
    REJECTED: [],
    REASSESSED: [],
  },
  evidence: {
    SUBMITTED: ["VERIFIED", "REJECTED"],
    REJECTED: ["SUBMITTED"],
    VERIFIED: [],
  },
  appeal: {
    OPEN: ["UNDER_REVIEW"],
    UNDER_REVIEW: ["UPHELD", "ACCEPTED"],
    UPHELD: [],
    ACCEPTED: [],
  },
  promotion: {
    RECOMMENDED: ["APPROVED", "REJECTED"],
    APPROVED: [],
    REJECTED: [],
  },
  reward: {
    PROPOSED: ["APPROVED", "CANCELLED"],
    APPROVED: ["PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
  },
  compensation: {
    PROPOSED: ["APPROVED", "REJECTED"],
    APPROVED: [],
    REJECTED: [],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type WorkflowName = keyof typeof WORKFLOWS;
export type StateOf<W extends WorkflowName> = keyof (typeof WORKFLOWS)[W] & string;

/** Transitions that must carry a human-written reason. */
const REASON_REQUIRED: ReadonlySet<string> = new Set([
  "assessment:UNDER_REVIEW>REJECTED",
  "assessment:UNDER_REVIEW>IN_PROGRESS",
  "evidence:SUBMITTED>REJECTED",
  "appeal:UNDER_REVIEW>UPHELD",
  "promotion:RECOMMENDED>REJECTED",
  "reward:PROPOSED>CANCELLED",
  "reward:APPROVED>CANCELLED",
  "compensation:PROPOSED>REJECTED",
]);

export function canTransition<W extends WorkflowName>(
  workflow: W,
  from: StateOf<W>,
  to: StateOf<W>,
): boolean {
  const allowed = (WORKFLOWS[workflow] as Record<string, readonly string[]>)[from] ?? [];
  return allowed.includes(to);
}

export const isTerminal = <W extends WorkflowName>(workflow: W, state: StateOf<W>): boolean =>
  ((WORKFLOWS[workflow] as Record<string, readonly string[]>)[state] ?? []).length === 0;

export function transition<W extends WorkflowName>(
  workflow: W,
  from: StateOf<W>,
  to: StateOf<W>,
  reason?: string,
): Result<StateOf<W>, "workflow.invalidTransition" | "workflow.reasonRequired"> {
  if (!canTransition(workflow, from, to)) return err("workflow.invalidTransition", { workflow, from, to });
  if (REASON_REQUIRED.has(`${workflow}:${from}>${to}`) && (reason === undefined || reason.trim() === ""))
    return err("workflow.reasonRequired", { workflow, from, to });
  return ok(to);
}
