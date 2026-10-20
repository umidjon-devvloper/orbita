import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { LocalizedText } from "../../lib/localized.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Catalog service — specialties, positions, competencies and the
 * position↔competency link. Shared shape across all three entities:
 *
 *   list → active rows first, by key;
 *   create → unique `(orgId, key)` or `(specialtyId, key)` on positions;
 *   update → only the given fields; name merges locale-wise so a PATCH
 *     with ru-only does not drop a prior uz value;
 *   disable → sets `isActive = false` (no hard delete; keeps FK history).
 *
 * Every mutation writes an audit row in the same transaction.
 */

const KEY = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function validateKey(key: string): void {
  if (!KEY.test(key)) {
    throw Errors.validation([
      { path: "key", message: "Key must be a-z 0-9 _ -, start with a letter or digit, max 63 chars" },
    ]);
  }
}

function mergeName(existing: unknown, patch: PartialLocalized): LocalizedText {
  const old: LocalizedText = (existing as LocalizedText | null | undefined) ?? { uz: "" };
  return {
    uz: patch.uz ?? old.uz,
    ...((patch.ru ?? old.ru) ? { ru: patch.ru ?? old.ru } : {}),
    ...((patch.en ?? old.en) ? { en: patch.en ?? old.en } : {}),
  };
}

// --- Specialty ---------------------------------------------------------------

export interface SpecialtyDTO {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly isActive: boolean;
}

export async function listSpecialties(prisma: PrismaClient, orgId: string): Promise<SpecialtyDTO[]> {
  const rows = await prisma.specialty.findMany({
    where: { orgId },
    orderBy: [{ isActive: "desc" }, { key: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name as LocalizedText,
    description: (r.description as LocalizedText | null) ?? null,
    isActive: r.isActive,
  }));
}

export interface SpecialtyInput {
  readonly key: string;
  readonly name: LocalizedText;
  readonly description?: LocalizedText | undefined;
}

export async function createSpecialty(
  prisma: PrismaClient,
  orgId: string,
  input: SpecialtyInput,
  audit: AuditContext,
): Promise<SpecialtyDTO> {
  validateKey(input.key);
  const existing = await prisma.specialty.findUnique({
    where: { orgId_key: { orgId, key: input.key } },
  });
  if (existing !== null) {
    throw new OrbitaError({
      code: "orbita:catalog:duplicate_key",
      status: 409,
      title: "A specialty with this key already exists",
    });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.specialty.create({
      data: {
        orgId,
        key: input.key,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "specialty.created",
      entityType: "Specialty",
      entityId: created.id,
      after: { key: input.key, name: input.name },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return {
    id: row.id,
    key: row.key,
    name: row.name as LocalizedText,
    description: (row.description as LocalizedText | null) ?? null,
    isActive: row.isActive,
  };
}

type PartialLocalized = { uz?: string | undefined; ru?: string | undefined; en?: string | undefined };

export interface SpecialtyPatch {
  readonly name?: PartialLocalized | undefined;
  readonly description?: PartialLocalized | undefined;
  readonly isActive?: boolean | undefined;
}

export async function updateSpecialty(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  patch: SpecialtyPatch,
  audit: AuditContext,
): Promise<SpecialtyDTO> {
  const existing = await prisma.specialty.findUnique({ where: { id } });
  if (existing === null || existing.orgId !== orgId) throw Errors.notFound("Specialty");

  const nextName = patch.name !== undefined ? mergeName(existing.name, patch.name) : null;
  const nextDesc =
    patch.description !== undefined ? mergeName(existing.description, patch.description) : null;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.specialty.update({
      where: { id },
      data: {
        ...(nextName !== null ? { name: nextName } : {}),
        ...(nextDesc !== null ? { description: nextDesc } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "specialty.updated",
      entityType: "Specialty",
      entityId: id,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: updated.name, isActive: updated.isActive },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return updated;
  });
  return {
    id: row.id,
    key: row.key,
    name: row.name as LocalizedText,
    description: (row.description as LocalizedText | null) ?? null,
    isActive: row.isActive,
  };
}

// --- Position ---------------------------------------------------------------

export interface PositionDTO {
  readonly id: string;
  readonly specialtyId: string;
  readonly key: string;
  readonly title: LocalizedText;
  readonly isActive: boolean;
  readonly competencies: readonly { competencyId: string; importance: number }[];
}

export async function listPositions(prisma: PrismaClient, orgId: string): Promise<PositionDTO[]> {
  const rows = await prisma.position.findMany({
    where: { specialty: { orgId } },
    orderBy: [{ isActive: "desc" }, { key: "asc" }],
    include: { competencies: true },
  });
  return rows.map((r) => ({
    id: r.id,
    specialtyId: r.specialtyId,
    key: r.key,
    title: r.title as LocalizedText,
    isActive: r.isActive,
    competencies: r.competencies.map((c) => ({ competencyId: c.competencyId, importance: c.importance })),
  }));
}

export interface PositionInput {
  readonly specialtyId: string;
  readonly key: string;
  readonly title: LocalizedText;
}

export async function createPosition(
  prisma: PrismaClient,
  orgId: string,
  input: PositionInput,
  audit: AuditContext,
): Promise<PositionDTO> {
  validateKey(input.key);
  const specialty = await prisma.specialty.findUnique({ where: { id: input.specialtyId } });
  if (specialty === null || specialty.orgId !== orgId) throw Errors.notFound("Specialty");
  const dup = await prisma.position.findUnique({
    where: { specialtyId_key: { specialtyId: input.specialtyId, key: input.key } },
  });
  if (dup !== null) {
    throw new OrbitaError({
      code: "orbita:catalog:duplicate_key",
      status: 409,
      title: "A position with this key already exists",
    });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.position.create({
      data: { specialtyId: input.specialtyId, key: input.key, title: input.title },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "position.created",
      entityType: "Position",
      entityId: created.id,
      after: { specialtyId: input.specialtyId, key: input.key },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return {
    id: row.id,
    specialtyId: row.specialtyId,
    key: row.key,
    title: row.title as LocalizedText,
    isActive: row.isActive,
    competencies: [],
  };
}

export async function setPositionCompetency(
  prisma: PrismaClient,
  orgId: string,
  positionId: string,
  competencyId: string,
  importance: number,
  audit: AuditContext,
): Promise<void> {
  if (importance < 1 || importance > 3) {
    throw Errors.validation([{ path: "importance", message: "Importance must be 1, 2 or 3" }]);
  }
  const [position, competency] = await Promise.all([
    prisma.position.findUnique({ where: { id: positionId }, include: { specialty: true } }),
    prisma.competency.findUnique({ where: { id: competencyId } }),
  ]);
  if (position === null || position.specialty.orgId !== orgId) throw Errors.notFound("Position");
  if (competency === null || competency.orgId !== orgId) throw Errors.notFound("Competency");

  await prisma.$transaction(async (tx) => {
    await tx.positionCompetency.upsert({
      where: { positionId_competencyId: { positionId, competencyId } },
      update: { importance },
      create: { positionId, competencyId, importance },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "position_competency.set",
      entityType: "PositionCompetency",
      entityId: `${positionId}:${competencyId}`,
      after: { positionId, competencyId, importance },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export async function removePositionCompetency(
  prisma: PrismaClient,
  orgId: string,
  positionId: string,
  competencyId: string,
  audit: AuditContext,
): Promise<void> {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    include: { specialty: true },
  });
  if (position === null || position.specialty.orgId !== orgId) throw Errors.notFound("Position");

  await prisma.$transaction(async (tx) => {
    await tx.positionCompetency
      .delete({ where: { positionId_competencyId: { positionId, competencyId } } })
      .catch(() => undefined);
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "position_competency.removed",
      entityType: "PositionCompetency",
      entityId: `${positionId}:${competencyId}`,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

// --- Competency -------------------------------------------------------------

export interface CompetencyDTO {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly isActive: boolean;
}

export async function listCompetencies(prisma: PrismaClient, orgId: string): Promise<CompetencyDTO[]> {
  const rows = await prisma.competency.findMany({
    where: { orgId },
    orderBy: [{ isActive: "desc" }, { key: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name as LocalizedText,
    isActive: r.isActive,
  }));
}

export async function createCompetency(
  prisma: PrismaClient,
  orgId: string,
  input: { key: string; name: LocalizedText },
  audit: AuditContext,
): Promise<CompetencyDTO> {
  validateKey(input.key);
  const dup = await prisma.competency.findUnique({ where: { orgId_key: { orgId, key: input.key } } });
  if (dup !== null) {
    throw new OrbitaError({
      code: "orbita:catalog:duplicate_key",
      status: 409,
      title: "A competency with this key already exists",
    });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.competency.create({ data: { orgId, key: input.key, name: input.name } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "competency.created",
      entityType: "Competency",
      entityId: created.id,
      after: { key: input.key, name: input.name },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return { id: row.id, key: row.key, name: row.name as LocalizedText, isActive: row.isActive };
}
