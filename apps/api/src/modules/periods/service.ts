import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Performance periods.
 *
 * A period is a date interval `[startsOn..endsOn]` scoped to one org.
 * Lifecycle:
 *
 *   OPEN      — assessments and evidence can land in it;
 *   LOCKED    — no new evidence, assessments can still be reviewed;
 *   FINALIZED — frozen for reporting and promotion decisions.
 *
 * No two periods for the same org may overlap in dates — rankings and
 * cohort math assume one period per day. Dates are stored as plain
 * `date` columns; the UI shows them in Asia/Tashkent so we normalize
 * every input to midnight UTC and refuse malformed strings.
 */

export type PeriodStatus = "OPEN" | "CLOSED" | "FINALIZED";

export interface PeriodDTO {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: PeriodStatus;
}

function toDTO(row: { id: string; startsOn: Date; endsOn: Date; status: string }): PeriodDTO {
  return {
    id: row.id,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    status: row.status as PeriodStatus,
  };
}

function toDate(iso: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw Errors.validation([{ path: field, message: "Expected YYYY-MM-DD" }]);
  }
  return new Date(`${iso}T00:00:00Z`);
}

export async function listPeriods(prisma: PrismaClient, orgId: string): Promise<PeriodDTO[]> {
  const rows = await prisma.performancePeriod.findMany({
    where: { orgId },
    orderBy: { startsOn: "desc" },
  });
  return rows.map(toDTO);
}

export interface CreatePeriodInput {
  readonly startsOn: string;
  readonly endsOn: string;
}

export async function createPeriod(
  prisma: PrismaClient,
  orgId: string,
  input: CreatePeriodInput,
  audit: AuditContext,
): Promise<PeriodDTO> {
  const starts = toDate(input.startsOn, "startsOn");
  const ends = toDate(input.endsOn, "endsOn");
  if (ends.getTime() < starts.getTime()) {
    throw Errors.validation([{ path: "endsOn", message: "endsOn must be >= startsOn" }]);
  }

  // Overlap: two intervals share any day iff aStart <= bEnd && bStart <= aEnd.
  const overlapping = await prisma.performancePeriod.findFirst({
    where: {
      orgId,
      startsOn: { lte: ends },
      endsOn: { gte: starts },
    },
    select: { id: true, startsOn: true, endsOn: true },
  });
  if (overlapping !== null) {
    throw new OrbitaError({
      code: "orbita:period:overlap",
      status: 409,
      title: "A period already overlaps this date range",
      detail: `Conflicting period ${overlapping.id} covers ${overlapping.startsOn
        .toISOString()
        .slice(0, 10)}..${overlapping.endsOn.toISOString().slice(0, 10)}`,
    });
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.performancePeriod.create({
      data: { orgId, startsOn: starts, endsOn: ends },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "period.created",
      entityType: "PerformancePeriod",
      entityId: created.id,
      after: { startsOn: input.startsOn, endsOn: input.endsOn },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return toDTO(row);
}

const ALLOWED: Record<string, readonly string[]> = {
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN", "FINALIZED"],
  FINALIZED: [],
};

export async function setPeriodStatus(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  next: PeriodStatus,
  audit: AuditContext,
): Promise<PeriodDTO> {
  const row = await prisma.performancePeriod.findUnique({ where: { id } });
  if (row === null || row.orgId !== orgId) throw Errors.notFound("Period");
  if (row.status === next) return toDTO(row);
  if (!(ALLOWED[row.status] ?? []).includes(next)) {
    throw new OrbitaError({
      code: "orbita:period:invalid_transition",
      status: 409,
      title: `Cannot move period ${row.status} → ${next}`,
    });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.performancePeriod.update({ where: { id }, data: { status: next } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: `period.${next.toLowerCase()}`,
      entityType: "PerformancePeriod",
      entityId: id,
      before: { status: row.status },
      after: { status: next },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return r;
  });
  return toDTO(updated);
}
