import type { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Org unit tree with a materialized `path`. The path is the one place
 * scope checks read ("does the subject's path start with the actor's
 * grant path?"), so it must stay consistent after every mutation:
 *
 *  - Create: path = (parent?.path ?? "/") + id + "/"
 *  - Rename: path unchanged (ids never move)
 *  - Reparent: recompute self + every descendant inside one transaction
 *  - Delete: refuse while children, role assignments or employees point
 *    at the unit; the DB's own ON DELETE RESTRICT backs this up.
 *
 * All mutations run through the AuditEvent writer, in the same
 * transaction, so a half-written move is impossible.
 */

export interface OrgUnitDTO {
  readonly id: string;
  readonly orgId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly path: string;
  readonly createdAt: string;
}

export interface AuditContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ip: string | null;
}

function toDTO(u: {
  id: string;
  orgId: string;
  parentId: string | null;
  name: string;
  path: string;
  createdAt: Date;
}): OrgUnitDTO {
  return {
    id: u.id,
    orgId: u.orgId,
    parentId: u.parentId,
    name: u.name,
    path: u.path,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listOrgUnits(
  prisma: PrismaClient,
  orgId: string,
  scopePath: string | null,
): Promise<OrgUnitDTO[]> {
  const rows = await prisma.orgUnit.findMany({
    where: {
      orgId,
      ...(scopePath !== null ? { path: { startsWith: scopePath } } : {}),
    },
    orderBy: { path: "asc" },
  });
  return rows.map(toDTO);
}

export interface CreateOrgUnitInput {
  readonly orgId: string;
  readonly parentId: string | null;
  readonly name: string;
}

export async function createOrgUnit(
  prisma: PrismaClient,
  input: CreateOrgUnitInput,
  audit: AuditContext,
): Promise<OrgUnitDTO> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw Errors.validation([{ path: "name", message: "Name is required" }]);
  }
  const parent =
    input.parentId !== null ? await prisma.orgUnit.findUnique({ where: { id: input.parentId } }) : null;
  if (input.parentId !== null && (parent === null || parent.orgId !== input.orgId)) {
    throw Errors.notFound("Parent unit");
  }

  // Reserve the id ahead of insert so the materialized path can embed it.
  const id = crypto.randomUUID();
  const base = parent?.path ?? "/";
  const path = `${base}${id}/`;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.orgUnit.create({
      data: {
        id,
        orgId: input.orgId,
        parentId: input.parentId,
        name,
        path,
      },
    });
    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: audit.actorId,
      action: "org_unit.created",
      entityType: "OrgUnit",
      entityId: row.id,
      after: { parentId: input.parentId, name, path },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return row;
  });
  return toDTO(created);
}

export interface UpdateOrgUnitInput {
  readonly id: string;
  readonly orgId: string;
  readonly name?: string;
  readonly parentId?: string | null;
}

export async function updateOrgUnit(
  prisma: PrismaClient,
  input: UpdateOrgUnitInput,
  audit: AuditContext,
): Promise<OrgUnitDTO> {
  const existing = await prisma.orgUnit.findUnique({ where: { id: input.id } });
  if (existing === null || existing.orgId !== input.orgId) throw Errors.notFound("Org unit");

  const nextName = input.name?.trim();
  if (input.name !== undefined && nextName === "") {
    throw Errors.validation([{ path: "name", message: "Name is required" }]);
  }

  // Rename-only path: no path recompute, no subtree walk.
  if (input.parentId === undefined || input.parentId === existing.parentId) {
    if (nextName === undefined || nextName === existing.name) {
      return toDTO(existing);
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.orgUnit.update({
        where: { id: existing.id },
        data: { name: nextName },
      });
      await writeAudit(tx, {
        orgId: input.orgId,
        actorId: audit.actorId,
        action: "org_unit.renamed",
        entityType: "OrgUnit",
        entityId: existing.id,
        before: { name: existing.name },
        after: { name: nextName },
        requestId: audit.requestId,
        ip: audit.ip,
      });
      return updated;
    });
    return toDTO(row);
  }

  // Reparent — refuse a move that would place the unit inside its own subtree.
  const newParentId: string | null = input.parentId ?? null;
  if (input.parentId === existing.id) {
    throw new OrbitaError({
      code: "orbita:org_unit:self_parent",
      status: 400,
      title: "An org unit cannot be its own parent",
    });
  }
  const newParent =
    input.parentId !== null ? await prisma.orgUnit.findUnique({ where: { id: input.parentId } }) : null;
  if (input.parentId !== null && (newParent === null || newParent.orgId !== input.orgId)) {
    throw Errors.notFound("Parent unit");
  }
  if (newParent !== null && newParent.path.startsWith(existing.path)) {
    throw new OrbitaError({
      code: "orbita:org_unit:cycle",
      status: 400,
      title: "An org unit cannot be moved into its own subtree",
    });
  }

  const basePath = newParent?.path ?? "/";
  const newSelfPath = `${basePath}${existing.id}/`;

  const row = await prisma.$transaction(async (tx) => {
    // Rewrite every descendant's path by stripping the old prefix and prepending the new one.
    const descendants = await tx.orgUnit.findMany({
      where: { orgId: input.orgId, path: { startsWith: existing.path } },
      select: { id: true, path: true },
    });
    for (const d of descendants) {
      const suffix = d.path.slice(existing.path.length);
      await tx.orgUnit.update({ where: { id: d.id }, data: { path: `${newSelfPath}${suffix}` } });
    }
    const updated = await tx.orgUnit.update({
      where: { id: existing.id },
      data: {
        parent: newParentId !== null ? { connect: { id: newParentId } } : { disconnect: true },
        path: newSelfPath,
        ...(nextName !== undefined ? { name: nextName } : {}),
      },
    });
    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: audit.actorId,
      action: "org_unit.moved",
      entityType: "OrgUnit",
      entityId: existing.id,
      before: { parentId: existing.parentId, path: existing.path, name: existing.name },
      after: { parentId: input.parentId, path: newSelfPath, name: nextName ?? existing.name },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return updated;
  });
  return toDTO(row);
}

export async function deleteOrgUnit(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  audit: AuditContext,
): Promise<void> {
  const existing = await prisma.orgUnit.findUnique({ where: { id } });
  if (existing === null || existing.orgId !== orgId) throw Errors.notFound("Org unit");

  const [childCount, employeeCount, assignmentCount] = await Promise.all([
    prisma.orgUnit.count({ where: { parentId: id } }),
    prisma.employee.count({ where: { orgUnitId: id } }),
    prisma.roleAssignment.count({ where: { orgUnitId: id } }),
  ]);
  if (childCount > 0 || employeeCount > 0 || assignmentCount > 0) {
    throw new OrbitaError({
      code: "orbita:org_unit:not_empty",
      status: 409,
      title: "Org unit still has children, employees or role assignments",
      detail: `children: ${childCount.toString()}, employees: ${employeeCount.toString()}, assignments: ${assignmentCount.toString()}`,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.orgUnit.delete({ where: { id } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "org_unit.deleted",
      entityType: "OrgUnit",
      entityId: id,
      before: { parentId: existing.parentId, name: existing.name, path: existing.path },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export type Tx = Prisma.TransactionClient;
