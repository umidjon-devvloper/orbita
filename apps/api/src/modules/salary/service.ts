import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Salary bands.
 *
 * A band ties a position + career level to a range `[minAmount, maxAmount]`
 * in whole UZS, effective across the date interval `[effectiveFrom,
 * effectiveTo]` (open-ended if `effectiveTo` is null).
 *
 * The one business rule here is overlap: two bands for the same
 * `(positionId, levelId)` must not share any day in their effective
 * windows. We check it in application code (no DB EXCLUDE constraint
 * for this one yet) by looking for any existing band whose window
 * intersects the proposed one. Overlap formula: `aStart <= bEnd ∧ bStart <= aEnd`
 * with open-ended windows represented as `+∞`.
 *
 * Bands are versioned by date, never updated in place for amounts —
 * instead the admin creates a new band with a later `effectiveFrom`
 * (and optionally closes the previous one). Status flips (approval,
 * close-out) are the only in-place changes supported here.
 */

export interface SalaryBandDTO {
  readonly id: string;
  readonly positionId: string;
  readonly levelId: string;
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly approval: "UNAPPROVED" | "APPROVED";
}

function toDTO(row: {
  id: string;
  positionId: string;
  levelId: string;
  minAmount: bigint;
  maxAmount: bigint;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  approval: string;
}): SalaryBandDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    levelId: row.levelId,
    minAmount: row.minAmount.toString(),
    maxAmount: row.maxAmount.toString(),
    currency: row.currency,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    approval: row.approval as "UNAPPROVED" | "APPROVED",
  };
}

export async function listSalaryBands(prisma: PrismaClient, orgId: string): Promise<SalaryBandDTO[]> {
  const rows = await prisma.salaryBand.findMany({
    where: { position: { specialty: { orgId } } },
    orderBy: [{ positionId: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map(toDTO);
}

export interface CreateSalaryBandInput {
  readonly positionId: string;
  readonly levelId: string;
  readonly minAmount: bigint | string | number;
  readonly maxAmount: bigint | string | number;
  readonly effectiveFrom: string; // ISO date YYYY-MM-DD
  readonly effectiveTo?: string | null | undefined;
}

function toDate(iso: string): Date {
  // Treat as midnight UTC — the schema stores dates without timezone.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw Errors.validation([{ path: "effectiveFrom", message: "Expected YYYY-MM-DD" }]);
  }
  return new Date(`${iso}T00:00:00Z`);
}

export async function createSalaryBand(
  prisma: PrismaClient,
  orgId: string,
  input: CreateSalaryBandInput,
  audit: AuditContext,
): Promise<SalaryBandDTO> {
  const minAmount = BigInt(input.minAmount);
  const maxAmount = BigInt(input.maxAmount);
  if (minAmount < 0n || maxAmount < 0n) {
    throw Errors.validation([{ path: "minAmount", message: "Amounts must be non-negative" }]);
  }
  if (minAmount > maxAmount) {
    throw Errors.validation([{ path: "maxAmount", message: "maxAmount must be >= minAmount" }]);
  }
  const effFrom = toDate(input.effectiveFrom);
  const effTo =
    input.effectiveTo !== null && input.effectiveTo !== undefined ? toDate(input.effectiveTo) : null;
  if (effTo !== null && effTo.getTime() < effFrom.getTime()) {
    throw Errors.validation([{ path: "effectiveTo", message: "effectiveTo must be >= effectiveFrom" }]);
  }

  const [position, level] = await Promise.all([
    prisma.position.findUnique({
      where: { id: input.positionId },
      include: { specialty: true },
    }),
    prisma.careerLevel.findUnique({ where: { id: input.levelId } }),
  ]);
  if (position === null || position.specialty.orgId !== orgId) throw Errors.notFound("Position");
  if (level === null || level.orgId !== orgId) throw Errors.notFound("Career level");

  // Overlap check: an existing band at (position, level) whose window shares
  // any day with [effFrom, effTo].
  const INFINITY = new Date("9999-12-31T00:00:00Z");
  const myEnd = effTo ?? INFINITY;
  const overlapping = await prisma.salaryBand.findFirst({
    where: {
      positionId: input.positionId,
      levelId: input.levelId,
      effectiveFrom: { lte: myEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effFrom } }],
    },
    select: { id: true, effectiveFrom: true, effectiveTo: true },
  });
  if (overlapping !== null) {
    throw new OrbitaError({
      code: "orbita:salary_band:overlap",
      status: 409,
      title: "A band for this position/level already covers part of this date range",
      detail: `Conflicting band ${overlapping.id} covers ${overlapping.effectiveFrom.toISOString().slice(0, 10)}..${overlapping.effectiveTo?.toISOString().slice(0, 10) ?? "∞"}`,
    });
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.salaryBand.create({
      data: {
        positionId: input.positionId,
        levelId: input.levelId,
        minAmount,
        maxAmount,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "salary_band.created",
      entityType: "SalaryBand",
      entityId: created.id,
      after: {
        positionId: input.positionId,
        levelId: input.levelId,
        minAmount: minAmount.toString(),
        maxAmount: maxAmount.toString(),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return toDTO(row);
}

export async function closeSalaryBand(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  effectiveTo: string,
  audit: AuditContext,
): Promise<SalaryBandDTO> {
  const existing = await prisma.salaryBand.findUnique({
    where: { id },
    include: { position: { include: { specialty: true } } },
  });
  if (existing === null || existing.position.specialty.orgId !== orgId) {
    throw Errors.notFound("Salary band");
  }
  const closeOn = toDate(effectiveTo);
  if (closeOn.getTime() < existing.effectiveFrom.getTime()) {
    throw Errors.validation([{ path: "effectiveTo", message: "effectiveTo must be >= effectiveFrom" }]);
  }
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.salaryBand.update({
      where: { id },
      data: { effectiveTo: closeOn },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "salary_band.closed",
      entityType: "SalaryBand",
      entityId: id,
      before: { effectiveTo: existing.effectiveTo?.toISOString().slice(0, 10) ?? null },
      after: { effectiveTo },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return updated;
  });
  return toDTO(row);
}

export async function approveSalaryBand(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  audit: AuditContext,
): Promise<void> {
  const existing = await prisma.salaryBand.findUnique({
    where: { id },
    include: { position: { include: { specialty: true } } },
  });
  if (existing === null || existing.position.specialty.orgId !== orgId) {
    throw Errors.notFound("Salary band");
  }
  if (existing.approval === "APPROVED") return;
  await prisma.$transaction(async (tx) => {
    await tx.salaryBand.update({ where: { id }, data: { approval: "APPROVED" } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "salary_band.approved",
      entityType: "SalaryBand",
      entityId: id,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}
