import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import { writeAudit } from "../audit/writer.js";

/**
 * User and role-assignment service.
 *
 * - Users are never deleted; `status` moves to DISABLED, which the
 *   loadActor path treats as a non-actor so sessions no longer validate.
 * - A new user has no `passwordHash` and relies on the password-reset
 *   flow to set one. The reset email is emitted at the route layer so
 *   this service stays I/O-free apart from the DB.
 * - Role assignments: the `role:manage` permission is seeded ORG-only,
 *   so only admins can grant/revoke. The DB-level unique on
 *   `(userId, roleId, orgUnitId)` prevents duplicates.
 */

export interface UserListItem {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly locale: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly roles: readonly { roleKey: string; orgUnitId: string | null; orgUnitPath: string | null }[];
}

export interface AuditContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ip: string | null;
}

export async function listUsers(prisma: PrismaClient, orgId: string): Promise<UserListItem[]> {
  const rows = await prisma.user.findMany({
    where: { orgId },
    orderBy: { email: "asc" },
    include: {
      assignments: {
        include: {
          role: { select: { key: true } },
          orgUnit: { select: { id: true, path: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    locale: r.locale,
    createdAt: r.createdAt.toISOString(),
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    roles: r.assignments.map((a) => ({
      roleKey: a.role.key,
      orgUnitId: a.orgUnit?.id ?? null,
      orgUnitPath: a.orgUnit?.path ?? null,
    })),
  }));
}

export interface CreateUserInput {
  readonly orgId: string;
  readonly email: string;
  readonly locale?: "uz" | "ru" | "en";
}

export interface CreatedUser {
  readonly id: string;
  readonly email: string;
  readonly status: string;
}

export async function createUser(
  prisma: PrismaClient,
  input: CreateUserInput,
  audit: AuditContext,
): Promise<CreatedUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { orgId: input.orgId, email } });
  if (existing !== null) {
    throw new OrbitaError({
      code: "orbita:user:duplicate_email",
      status: 409,
      title: "A user with this email already exists",
    });
  }
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        orgId: input.orgId,
        email,
        locale: input.locale ?? "uz",
        passwordHash: null,
      },
    });
    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: audit.actorId,
      action: "user.created",
      entityType: "User",
      entityId: row.id,
      after: { email, locale: row.locale },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return row;
  });
  return { id: created.id, email: created.email, status: created.status };
}

export async function setUserStatus(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  status: "ACTIVE" | "DISABLED",
  audit: AuditContext,
): Promise<void> {
  if (userId === audit.actorId) {
    throw new OrbitaError({
      code: "orbita:user:cannot_change_self_status",
      status: 400,
      title: "You cannot disable your own account",
    });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user === null || user.orgId !== orgId) throw Errors.notFound("User");
  if (user.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "DISABLED") {
      // Kick every open session so the change takes effect immediately.
      await tx.session.deleteMany({ where: { userId } });
    }
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "user.status_changed",
      entityType: "User",
      entityId: userId,
      before: { status: user.status },
      after: { status },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export interface AssignRoleInput {
  readonly orgId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly orgUnitId: string | null;
}

export async function assignRole(
  prisma: PrismaClient,
  input: AssignRoleInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  const [user, role, orgUnit] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.role.findUnique({
      where: { id: input.roleId },
      include: { permissions: true },
    }),
    input.orgUnitId !== null
      ? prisma.orgUnit.findUnique({ where: { id: input.orgUnitId } })
      : Promise.resolve(null),
  ]);
  if (user === null || user.orgId !== input.orgId) throw Errors.notFound("User");
  if (role === null || role.orgId !== input.orgId) throw Errors.notFound("Role");
  if (input.orgUnitId !== null && (orgUnit === null || orgUnit.orgId !== input.orgId)) {
    throw Errors.notFound("Org unit");
  }

  // Must have an org unit iff the role has at least one ORG_UNIT scope grant.
  const needsOrgUnit = role.permissions.some((p) => p.scope === "ORG_UNIT");
  if (needsOrgUnit && input.orgUnitId === null) {
    throw Errors.validation([
      { path: "orgUnitId", message: "This role has unit-scoped permissions and requires orgUnitId" },
    ]);
  }
  if (!needsOrgUnit && input.orgUnitId !== null) {
    throw Errors.validation([
      { path: "orgUnitId", message: "This role has no unit-scoped permissions; omit orgUnitId" },
    ]);
  }

  const existing = await prisma.roleAssignment.findFirst({
    where: {
      userId: input.userId,
      roleId: input.roleId,
      orgUnitId: input.orgUnitId,
    },
    select: { id: true },
  });
  if (existing !== null) return { id: existing.id };

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.roleAssignment.create({
      data: {
        userId: input.userId,
        roleId: input.roleId,
        orgUnitId: input.orgUnitId,
        grantedById: audit.actorId,
      },
    });
    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: audit.actorId,
      action: "role_assignment.granted",
      entityType: "RoleAssignment",
      entityId: created.id,
      after: {
        userId: input.userId,
        roleId: input.roleId,
        orgUnitId: input.orgUnitId,
        roleKey: role.key,
      },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return created;
  });
  return { id: row.id };
}

export async function revokeRole(
  prisma: PrismaClient,
  orgId: string,
  assignmentId: string,
  audit: AuditContext,
): Promise<void> {
  const assignment = await prisma.roleAssignment.findUnique({
    where: { id: assignmentId },
    include: { user: true, role: true },
  });
  if (assignment === null || assignment.user.orgId !== orgId) {
    throw Errors.notFound("Role assignment");
  }
  // Admins cannot strip their own last admin grant — otherwise a lockout
  // is one wrong click away. The check is cheap and worth it.
  if (assignment.userId === audit.actorId) {
    const otherAssignments = await prisma.roleAssignment.count({
      where: { userId: audit.actorId, id: { not: assignmentId } },
    });
    if (otherAssignments === 0) {
      throw new OrbitaError({
        code: "orbita:role_assignment:cannot_revoke_last_self",
        status: 400,
        title: "You cannot revoke your own last role",
      });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.roleAssignment.delete({ where: { id: assignmentId } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "role_assignment.revoked",
      entityType: "RoleAssignment",
      entityId: assignmentId,
      before: {
        userId: assignment.userId,
        roleId: assignment.roleId,
        orgUnitId: assignment.orgUnitId,
        roleKey: assignment.role.key,
      },
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

export interface RoleListItem {
  readonly id: string;
  readonly key: string;
  readonly name: { uz?: string; ru?: string; en?: string };
  readonly isSystem: boolean;
  readonly permissions: readonly { permission: string; scope: string }[];
}

export async function listRoles(prisma: PrismaClient, orgId: string): Promise<RoleListItem[]> {
  const rows = await prisma.role.findMany({
    where: { orgId },
    orderBy: { key: "asc" },
    include: { permissions: { orderBy: { permission: "asc" } } },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name as { uz?: string; ru?: string; en?: string },
    isSystem: r.isSystem,
    permissions: r.permissions.map((p) => ({ permission: p.permission, scope: p.scope })),
  }));
}
