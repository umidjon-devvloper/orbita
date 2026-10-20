import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Evidence service.
 *
 * The lifecycle (see domain `workflow.ts`):
 *
 *   SUBMITTED → VERIFIED (one way; verified evidence is used by scoring);
 *   SUBMITTED → REJECTED (with a reason);
 *   REJECTED  → SUBMITTED (resubmit after fixes).
 *
 * Separation of duties: the submitter cannot verify their own
 * evidence (D-22). The service enforces this itself; the DB does not
 * know who the actor is at write time.
 *
 * Revenue rule (D-27, SCORING_MODEL): `serviceFee` is the only money
 * that counts toward revenue; `governmentFee` is retained for the
 * audit trail but never contributes to scores.
 */

export interface EvidenceDTO {
  readonly id: string;
  readonly employeeId: string;
  readonly periodId: string;
  readonly type: string;
  readonly source: string;
  readonly externalId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly occurredOn: string;
  readonly serviceFee: string | null;
  readonly governmentFee: string | null;
  readonly quantity: number | null;
  readonly metrics: unknown;
  readonly status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  readonly submittedById: string | null;
  readonly verifiedById: string | null;
  readonly verifiedAt: string | null;
  readonly rejectionReason: string | null;
}

function toDTO(row: {
  id: string;
  employeeId: string;
  periodId: string;
  type: string;
  source: string;
  externalId: string | null;
  title: string;
  description: string | null;
  occurredOn: Date;
  serviceFee: bigint | null;
  governmentFee: bigint | null;
  quantity: number | null;
  metrics: unknown;
  status: string;
  submittedById: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
}): EvidenceDTO {
  return {
    id: row.id,
    employeeId: row.employeeId,
    periodId: row.periodId,
    type: row.type,
    source: row.source,
    externalId: row.externalId,
    title: row.title,
    description: row.description,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    serviceFee: row.serviceFee?.toString() ?? null,
    governmentFee: row.governmentFee?.toString() ?? null,
    quantity: row.quantity,
    metrics: row.metrics,
    status: row.status as "SUBMITTED" | "VERIFIED" | "REJECTED",
    submittedById: row.submittedById,
    verifiedById: row.verifiedById,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
  };
}

export interface ListFilter {
  readonly periodId?: string | undefined;
  readonly employeeId?: string | undefined;
  readonly status?: "SUBMITTED" | "VERIFIED" | "REJECTED" | undefined;
}

export async function listEvidence(
  prisma: PrismaClient,
  orgId: string,
  filter: ListFilter,
): Promise<EvidenceDTO[]> {
  const rows = await prisma.evidence.findMany({
    where: {
      orgId,
      ...(filter.periodId !== undefined ? { periodId: filter.periodId } : {}),
      ...(filter.employeeId !== undefined ? { employeeId: filter.employeeId } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toDTO);
}

const RECORD_TYPES = new Set(["SERVICE_RECORD", "SALE", "CUSTOMER_FEEDBACK"]);
const CONTRIB_TYPES = new Set([
  "TRAINING",
  "MENTORING",
  "PROCESS_IMPROVEMENT",
  "NEW_CUSTOMER",
  "WORK_SAMPLE",
  "OTHER",
]);
const EVIDENCE_TYPES = new Set([...RECORD_TYPES, ...CONTRIB_TYPES]);

function toDate(iso: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw Errors.validation([{ path: field, message: "Expected YYYY-MM-DD" }]);
  }
  return new Date(`${iso}T00:00:00Z`);
}

export interface SubmitInput {
  readonly employeeId: string;
  readonly periodId: string;
  readonly type: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly occurredOn: string;
  readonly serviceFee?: string | number | undefined;
  readonly governmentFee?: string | number | undefined;
  readonly quantity?: number | undefined;
  readonly metrics?: Record<string, unknown> | undefined;
}

export async function submitEvidence(
  prisma: PrismaClient,
  orgId: string,
  input: SubmitInput,
  audit: AuditContext,
): Promise<EvidenceDTO> {
  if (!EVIDENCE_TYPES.has(input.type)) {
    throw Errors.validation([{ path: "type", message: `Unknown evidence type ${input.type}` }]);
  }
  const [period, employee] = await Promise.all([
    prisma.performancePeriod.findUnique({ where: { id: input.periodId } }),
    prisma.employee.findUnique({ where: { id: input.employeeId } }),
  ]);
  if (period === null || period.orgId !== orgId) throw Errors.notFound("Period");
  if (employee === null || employee.orgId !== orgId) throw Errors.notFound("Employee");
  if (period.status !== "OPEN") {
    throw new OrbitaError({
      code: "orbita:evidence:period_closed",
      status: 409,
      title: "Cannot submit evidence to a non-OPEN period",
    });
  }

  const occurredOn = toDate(input.occurredOn, "occurredOn");
  // Guard: service fee counts toward revenue, government fee never does.
  // Both are optional and non-negative.
  const serviceFee = input.serviceFee !== undefined ? BigInt(input.serviceFee) : null;
  const governmentFee = input.governmentFee !== undefined ? BigInt(input.governmentFee) : null;
  if ((serviceFee ?? 0n) < 0n || (governmentFee ?? 0n) < 0n) {
    throw Errors.validation([{ path: "serviceFee", message: "Fees must be non-negative" }]);
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.evidence.create({
      data: {
        orgId,
        employeeId: input.employeeId,
        periodId: input.periodId,
        type: input.type as never,
        title: input.title.trim(),
        ...(input.description !== undefined ? { description: input.description } : {}),
        occurredOn,
        ...(serviceFee !== null ? { serviceFee } : {}),
        ...(governmentFee !== null ? { governmentFee } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.metrics !== undefined ? { metrics: input.metrics as never } : {}),
        submittedById: audit.actorId,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "evidence.submitted",
      entityType: "Evidence",
      entityId: created.id,
      after: {
        type: input.type,
        periodId: input.periodId,
        employeeId: input.employeeId,
        serviceFee: serviceFee?.toString() ?? null,
      },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return toDTO(row);
}

export async function verifyEvidence(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  audit: AuditContext,
): Promise<EvidenceDTO> {
  const row = await prisma.evidence.findUnique({ where: { id } });
  if (row === null || row.orgId !== orgId) throw Errors.notFound("Evidence");
  if (row.status === "VERIFIED") return toDTO(row);
  if (row.status !== "SUBMITTED") {
    throw new OrbitaError({
      code: "orbita:evidence:invalid_transition",
      status: 409,
      title: `Cannot verify evidence in ${row.status}`,
    });
  }
  if (row.submittedById !== null && row.submittedById === audit.actorId) {
    throw new OrbitaError({
      code: "orbita:evidence:sod_self",
      status: 403,
      title: "You cannot verify your own evidence (separation of duties)",
    });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.evidence.update({
      where: { id },
      data: { status: "VERIFIED", verifiedById: audit.actorId, verifiedAt: now, rejectionReason: null },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "evidence.verified",
      entityType: "Evidence",
      entityId: id,
      before: { status: row.status },
      after: { status: "VERIFIED" },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return r;
  });
  return toDTO(updated);
}

export async function rejectEvidence(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  reason: string,
  audit: AuditContext,
): Promise<EvidenceDTO> {
  if (reason.trim().length === 0) {
    throw Errors.validation([{ path: "reason", message: "A reason is required" }]);
  }
  const row = await prisma.evidence.findUnique({ where: { id } });
  if (row === null || row.orgId !== orgId) throw Errors.notFound("Evidence");
  if (row.status !== "SUBMITTED") {
    throw new OrbitaError({
      code: "orbita:evidence:invalid_transition",
      status: 409,
      title: `Cannot reject evidence in ${row.status}`,
    });
  }
  if (row.submittedById !== null && row.submittedById === audit.actorId) {
    throw new OrbitaError({
      code: "orbita:evidence:sod_self",
      status: 403,
      title: "You cannot reject your own evidence (separation of duties)",
    });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.evidence.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason.trim() },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "evidence.rejected",
      entityType: "Evidence",
      entityId: id,
      before: { status: row.status },
      after: { status: "REJECTED", reason: reason.trim() },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return r;
  });
  return toDTO(updated);
}
