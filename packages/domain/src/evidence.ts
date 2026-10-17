import { sum } from "./math.js";

export const EVIDENCE_TYPES = [
  "SERVICE_RECORD",
  "SALE",
  "CUSTOMER_FEEDBACK",
  "TRAINING",
  "MENTORING",
  "PROCESS_IMPROVEMENT",
  "NEW_CUSTOMER",
  "WORK_SAMPLE",
  "OTHER",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * RECORD evidence is operational data (usually imported). Different metric criteria may read
 * different fields of the same record (quality reads errorFree, volume reads tier) — that is not
 * double counting. Rubric validation forbids two criteria reading the same field of the same type.
 *
 * CONTRIBUTION evidence is a claimed contribution (a mentoring session, a course). It is credited
 * to exactly one criterion per period (EvidenceAllocation unique (evidenceId, periodId)).
 */
export const RECORD_TYPES: ReadonlySet<EvidenceType> = new Set([
  "SERVICE_RECORD",
  "SALE",
  "CUSTOMER_FEEDBACK",
]);
export const isRecordType = (t: EvidenceType): boolean => RECORD_TYPES.has(t);

export type EvidenceStatus = "SUBMITTED" | "VERIFIED" | "REJECTED";
export type EvidenceSource = "MANUAL" | "CSV_IMPORT" | "CRM";

export interface EvidenceItem {
  readonly id: string;
  readonly type: EvidenceType;
  readonly status: EvidenceStatus;
  /** whole UZS retained by the company — the only money field metrics can read */
  readonly serviceFee?: bigint;
  /** whole UZS collected for the state — stored for display, never readable by metrics */
  readonly governmentFee?: bigint;
  readonly quantity?: bigint;
  readonly tier?: string;
  readonly errorFree?: boolean;
  /** customer satisfaction 1–5 for CUSTOMER_FEEDBACK */
  readonly csat?: bigint;
}

/** Deduplication key for imported / CRM evidence. Manual evidence has no external identity. */
export function dedupeKey(
  orgId: string,
  source: EvidenceSource,
  externalId: string | undefined,
): string | null {
  if (source === "MANUAL") return null;
  if (externalId === undefined || externalId.trim() === "") return null;
  return `${orgId}:${source}:${externalId.trim()}`;
}

/** Split rows into new vs duplicate by dedupe key (also catches duplicates inside the same batch). */
export function partitionDuplicates<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | null,
  existingKeys: ReadonlySet<string>,
): { fresh: T[]; duplicates: T[] } {
  const seen = new Set(existingKeys);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (key !== null && seen.has(key)) {
      duplicates.push(row);
      continue;
    }
    if (key !== null) seen.add(key);
    fresh.push(row);
  }
  return { fresh, duplicates };
}

// ─────────────────────────── Measures ───────────────────────────

/** Fields a measure may read. governmentFee is deliberately absent. */
export type SumField = "serviceFee" | "quantity";

export type Measure =
  | { readonly op: "sum"; readonly field: SumField; readonly types: readonly EvidenceType[] }
  | {
      readonly op: "weightedCount";
      readonly types: readonly EvidenceType[];
      readonly weightsByTier: Readonly<Record<string, bigint>>;
    }
  | { readonly op: "share"; readonly flag: "errorFree"; readonly types: readonly EvidenceType[] }
  | { readonly op: "average"; readonly field: "csat"; readonly types: readonly EvidenceType[] };

/** Which (type, field) pairs a measure reads — used to forbid double counting across criteria. */
export function measureReads(m: Measure): string[] {
  const field =
    m.op === "sum" ? m.field : m.op === "weightedCount" ? "tier" : m.op === "share" ? m.flag : m.field;
  return m.types.map((t) => `${t}.${field}`);
}

/** Exact fraction value of a measure over VERIFIED items. null = no data (denominator 0). */
export interface Fraction {
  readonly num: bigint;
  readonly den: bigint;
}

export function evaluateMeasure(m: Measure, items: readonly EvidenceItem[]): Fraction | null {
  const relevant = items.filter((i) => i.status === "VERIFIED" && m.types.includes(i.type));
  switch (m.op) {
    case "sum":
      return {
        num: sum(relevant.map((i) => (m.field === "serviceFee" ? i.serviceFee : i.quantity) ?? 0n)),
        den: 1n,
      };
    case "weightedCount":
      return {
        num: sum(relevant.map((i) => (i.tier === undefined ? 0n : (m.weightsByTier[i.tier] ?? 0n)))),
        den: 1n,
      };
    case "share": {
      if (relevant.length === 0) return null;
      return {
        num: BigInt(relevant.filter((i) => i.errorFree === true).length),
        den: BigInt(relevant.length),
      };
    }
    case "average": {
      const ratings = relevant.flatMap((i) => (i.csat === undefined ? [] : [i.csat]));
      if (ratings.length === 0) return null;
      return { num: sum(ratings), den: BigInt(ratings.length) };
    }
  }
}

export interface EvidenceCounts {
  readonly verified: number;
  readonly pending: number;
  readonly rejected: number;
}

export function countByStatus(
  items: readonly EvidenceItem[],
  types?: readonly EvidenceType[],
): EvidenceCounts {
  const xs = types === undefined ? items : items.filter((i) => types.includes(i.type));
  return {
    verified: xs.filter((i) => i.status === "VERIFIED").length,
    pending: xs.filter((i) => i.status === "SUBMITTED").length,
    rejected: xs.filter((i) => i.status === "REJECTED").length,
  };
}

/** Pending (SUBMITTED) serviceFee — shown as "pending, not counted". */
export const pendingServiceFee = (items: readonly EvidenceItem[]): bigint =>
  sum(items.filter((i) => i.status === "SUBMITTED").map((i) => i.serviceFee ?? 0n));
