import type { Actor, Grant, Permission, Scope } from "@orbita/domain";
import { PERMISSIONS } from "@orbita/domain";
import type { PrismaClient } from "../../db/client.js";

/**
 * Resolve a signed-in user's full set of permission grants from the DB.
 *
 * Reads once per request (callers cache on the Fastify request). The query
 * joins RoleAssignment → Role → RolePermission plus the assigned OrgUnit
 * so that an ORG_UNIT grant arrives with a materialized `path` ready for
 * subtree checks (`path.startsWith(resource.path)`).
 *
 * An ORG_UNIT permission without a matching assignment unit is skipped —
 * the row is malformed, not a quiet "grant everything" fallback.
 */
export async function loadActor(prisma: PrismaClient, userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employee: { select: { id: true } },
      assignments: {
        include: {
          role: { include: { permissions: true } },
          orgUnit: { select: { path: true } },
        },
      },
    },
  });
  if (user === null || user.status !== "ACTIVE") return null;

  const grants: Grant[] = [];
  for (const a of user.assignments) {
    for (const rp of a.role.permissions) {
      if (!isPermission(rp.permission)) continue;
      const scope: Scope = rp.scope;
      if (scope === "ORG_UNIT") {
        if (a.orgUnit === null) continue; // malformed row — treat as missing
        grants.push({ permission: rp.permission, scope, orgUnitPath: a.orgUnit.path });
      } else {
        grants.push({ permission: rp.permission, scope });
      }
    }
  }

  return {
    userId: user.id,
    ...(user.employee !== null ? { employeeId: user.employee.id } : {}),
    grants,
  };
}

const PERM_SET: ReadonlySet<string> = new Set(PERMISSIONS);
function isPermission(p: string): p is Permission {
  return PERM_SET.has(p);
}
