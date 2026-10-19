import { DEFAULT_ROLES } from "@orbita/domain";
import type { PrismaClient } from "../../db/client.js";

/**
 * Seed the three default roles (admin, manager, employee) for an
 * organization. Idempotent: existing roles with the same key are left
 * alone, and the permission set is rewritten to match the current
 * catalogue so an upgrade can broaden a role without renaming it.
 *
 * Returns a map of role keys to their DB ids so callers can wire up
 * initial RoleAssignments.
 */
type DefaultRoleKey = "admin" | "manager" | "employee";

export async function seedDefaultRoles(
  prisma: PrismaClient,
  orgId: string,
): Promise<Record<DefaultRoleKey, string>> {
  const result: Partial<Record<DefaultRoleKey, string>> = {};
  for (const [key, spec] of Object.entries(DEFAULT_ROLES) as [
    DefaultRoleKey,
    (typeof DEFAULT_ROLES)[DefaultRoleKey],
  ][]) {
    const name = { uz: NAMES_UZ[key], ru: NAMES_RU[key], en: NAMES_EN[key] };
    const role = await prisma.role.upsert({
      where: { orgId_key: { orgId, key } },
      update: { name, isSystem: true },
      create: { orgId, key, name, isSystem: true },
    });
    // Rewrite permissions in one transaction so the role is never partial.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: Object.entries(spec).map(([permission, scope]) => ({
          roleId: role.id,
          permission,
          scope,
        })),
      }),
    ]);
    result[key] = role.id;
  }
  return result as Record<DefaultRoleKey, string>;
}

const NAMES_UZ = { admin: "Administrator", manager: "Menejer", employee: "Xodim" };
const NAMES_RU = { admin: "Администратор", manager: "Менеджер", employee: "Сотрудник" };
const NAMES_EN = { admin: "Administrator", manager: "Manager", employee: "Employee" };
