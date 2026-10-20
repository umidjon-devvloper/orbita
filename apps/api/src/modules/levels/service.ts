import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { LocalizedText } from "../../lib/localized.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Career levels and their requirements.
 *
 * - Levels have a `rank` for display order (smallint). The reorder
 *   endpoint accepts a complete ordered list of ids and rewrites every
 *   rank in one transaction; without that, two levels could end up at
 *   the same rank during a swap (the DB has a partial unique index on
 *   active rows, so a naive swap would conflict).
 * - A level is never deleted — it is marked inactive. Inactive levels
 *   leave `rank` as-is (the index is partial over active) so promotions
 *   that pointed at them stay reproducible.
 * - LevelRequirement rows link a level to (specialty, competency) with
 *   a minScore (hundredths) and a `isGate` flag (D-31).
 * - A level is UNAPPROVED until an admin explicitly approves it. The
 *   UI shows a badge; this service only exposes a toggle endpoint.
 */

export interface LevelDTO {
  readonly id: string;
  readonly key: string;
  readonly rank: number;
  readonly name: LocalizedText;
  readonly approval: "UNAPPROVED" | "APPROVED";
  readonly isActive: boolean;
  readonly minTotalScore: number | null;
  readonly minMonthsAtPrevious: number | null;
  readonly minApprovedAssessments: number;
  readonly requirements: readonly {
    id: string;
    specialtyId: string;
    competencyId: string;
    minScore: number;
    isGate: boolean;
  }[];
}

const KEY = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function toDTO(row: {
  id: string;
  key: string;
  rank: number;
  name: unknown;
  approval: string;
  isActive: boolean;
  minTotalScore: number | null;
  minMonthsAtPrevious: number | null;
  minApprovedAssessments: number;
  requirements: {
    id: string;
    specialtyId: string;
    competencyId: string;
    minScore: number;
    isGate: boolean;
  }[];
}): LevelDTO {
  return {
    id: row.id,
    key: row.key,
    rank: row.rank,
    name: row.name as LocalizedText,
    approval: row.approval as "UNAPPROVED" | "APPROVED",
    isActive: row.isActive,
    minTotalScore: row.minTotalScore,
    minMonthsAtPrevious: row.minMonthsAtPrevious,
    minApprovedAssessments: row.minApprovedAssessments,
    requirements: row.requirements.map((r) => ({
      id: r.id,
      specialtyId: r.specialtyId,
      competencyId: r.competencyId,
      minScore: r.minScore,
      isGate: r.isGate,
    })),
  };
}

export async function listLevels(prisma: PrismaClient, orgId: string): Promise<LevelDTO[]> {
  const rows = await prisma.careerLevel.findMany({
    where: { orgId },
    orderBy: [{ isActive: "desc" }, { rank: "asc" }],
    include: { requirements: true },
  });
  return rows.map(toDTO);
}

export interface CreateLevelInput {
  readonly key: string;
  readonly name: LocalizedText;
  readonly minTotalScore?: number | null | undefined;
  readonly minMonthsAtPrevious?: number | null | undefined;
  readonly minApprovedAssessments?: number | undefined;
}

export async function createLevel(
  prisma: PrismaClient,
  orgId: string,
  input: CreateLevelInput,
  audit: AuditContext,
): Promise<LevelDTO> {
  if (!KEY.test(input.key)) {
    throw Errors.validation([{ path: "key", message: "Invalid key" }]);
  }
  const dup = await prisma.careerLevel.findUnique({ where: { orgId_key: { orgId, key: input.key } } });
  if (dup !== null) {
    throw new OrbitaError({
      code: "orbita:level:duplicate_key",
      status: 409,
      title: "A level with this key already exists",
    });
  }

  // New level goes last (max rank + 1 across active rows).
  const maxRank = await prisma.careerLevel.aggregate({
    where: { orgId, isActive: true },
    _max: { rank: true },
  });
  const nextRank = (maxRank._max.rank ?? 0) + 1;

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.careerLevel.create({
      data: {
        orgId,
        key: input.key,
        name: input.name,
        rank: nextRank,
        ...(input.minTotalScore !== undefined ? { minTotalScore: input.minTotalScore } : {}),
        ...(input.minMonthsAtPrevious !== undefined
          ? { minMonthsAtPrevious: input.minMonthsAtPrevious }
          : {}),
        ...(input.minApprovedAssessments !== undefined
          ? { minApprovedAssessments: input.minApprovedAssessments }
          : {}),
      },
      include: { requirements: true },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "career_level.created",
      entityType: "CareerLevel",
      entityId: created.id,
      after: { key: input.key, rank: nextRank, name: input.name },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return toDTO(row);
}

/**
 * Rewrite every active level's rank from a fully-ordered id list. All in
 * one transaction so the partial unique index (`(orgId, rank) where
 * isActive`) is never transiently violated. We assign absurdly large
 * negative ranks first, then the final positive ranks, to sidestep
 * mid-transaction uniqueness clashes.
 */
export async function reorderLevels(
  prisma: PrismaClient,
  orgId: string,
  orderedIds: readonly string[],
  audit: AuditContext,
): Promise<void> {
  const active = await prisma.careerLevel.findMany({
    where: { orgId, isActive: true },
    select: { id: true },
  });
  const activeIds = new Set(active.map((l) => l.id));
  if (orderedIds.length !== activeIds.size) {
    throw Errors.validation([
      { path: "orderedIds", message: "orderedIds must list every active level exactly once" },
    ]);
  }
  for (const id of orderedIds) {
    if (!activeIds.has(id)) throw Errors.notFound("Career level");
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw Errors.validation([{ path: "orderedIds", message: "orderedIds must be unique" }]);
  }

  await prisma.$transaction(async (tx) => {
    // Phase 1: park every row at a unique negative rank.
    let i = 0;
    for (const id of orderedIds) {
      await tx.careerLevel.update({ where: { id }, data: { rank: -(i + 1) } });
      i += 1;
    }
    // Phase 2: assign the real ranks (1-based).
    i = 0;
    for (const id of orderedIds) {
      await tx.careerLevel.update({ where: { id }, data: { rank: i + 1 } });
      i += 1;
    }
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "career_level.reordered",
      entityType: "CareerLevel",
      entityId: orderedIds.join(","),
      after: { orderedIds: [...orderedIds] },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export async function setLevelActive(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  isActive: boolean,
  audit: AuditContext,
): Promise<void> {
  const level = await prisma.careerLevel.findUnique({ where: { id } });
  if (level === null || level.orgId !== orgId) throw Errors.notFound("Career level");
  if (level.isActive === isActive) return;
  await prisma.$transaction(async (tx) => {
    await tx.careerLevel.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: isActive ? "career_level.enabled" : "career_level.disabled",
      entityType: "CareerLevel",
      entityId: id,
      before: { isActive: level.isActive },
      after: { isActive },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export async function approveLevel(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  audit: AuditContext,
): Promise<void> {
  const level = await prisma.careerLevel.findUnique({ where: { id } });
  if (level === null || level.orgId !== orgId) throw Errors.notFound("Career level");
  if (level.approval === "APPROVED") return;
  await prisma.$transaction(async (tx) => {
    await tx.careerLevel.update({ where: { id }, data: { approval: "APPROVED" } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "career_level.approved",
      entityType: "CareerLevel",
      entityId: id,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export interface RequirementInput {
  readonly specialtyId: string;
  readonly competencyId: string;
  readonly minScore: number;
  readonly isGate: boolean;
}

export async function upsertRequirement(
  prisma: PrismaClient,
  orgId: string,
  levelId: string,
  input: RequirementInput,
  audit: AuditContext,
): Promise<void> {
  if (input.minScore < 0 || input.minScore > 10000) {
    throw Errors.validation([{ path: "minScore", message: "minScore must be between 0 and 10000" }]);
  }
  const [level, specialty, competency] = await Promise.all([
    prisma.careerLevel.findUnique({ where: { id: levelId } }),
    prisma.specialty.findUnique({ where: { id: input.specialtyId } }),
    prisma.competency.findUnique({ where: { id: input.competencyId } }),
  ]);
  if (level === null || level.orgId !== orgId) throw Errors.notFound("Career level");
  if (specialty === null || specialty.orgId !== orgId) throw Errors.notFound("Specialty");
  if (competency === null || competency.orgId !== orgId) throw Errors.notFound("Competency");

  await prisma.$transaction(async (tx) => {
    await tx.levelRequirement.upsert({
      where: {
        levelId_specialtyId_competencyId: {
          levelId,
          specialtyId: input.specialtyId,
          competencyId: input.competencyId,
        },
      },
      update: { minScore: input.minScore, isGate: input.isGate },
      create: {
        levelId,
        specialtyId: input.specialtyId,
        competencyId: input.competencyId,
        minScore: input.minScore,
        isGate: input.isGate,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "level_requirement.set",
      entityType: "LevelRequirement",
      entityId: `${levelId}:${input.specialtyId}:${input.competencyId}`,
      after: input,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export async function removeRequirement(
  prisma: PrismaClient,
  orgId: string,
  levelId: string,
  specialtyId: string,
  competencyId: string,
  audit: AuditContext,
): Promise<void> {
  const level = await prisma.careerLevel.findUnique({ where: { id: levelId } });
  if (level === null || level.orgId !== orgId) throw Errors.notFound("Career level");
  await prisma.$transaction(async (tx) => {
    await tx.levelRequirement
      .delete({
        where: { levelId_specialtyId_competencyId: { levelId, specialtyId, competencyId } },
      })
      .catch(() => undefined);
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "level_requirement.removed",
      entityType: "LevelRequirement",
      entityId: `${levelId}:${specialtyId}:${competencyId}`,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}
