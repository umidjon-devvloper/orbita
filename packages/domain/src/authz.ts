/** Permission catalogue — docs/SECURITY.md §2. */
export const PERMISSIONS = [
  "org:manage",
  "user:manage",
  "role:manage",
  "config:manage",
  "compensation:manage",
  "compensation:read",
  "employee:read",
  "employee:manage",
  "candidate:read",
  "candidate:manage",
  "assessment:conduct",
  "assessment:approve",
  "evidence:submit",
  "evidence:verify",
  "appeal:submit",
  "appeal:resolve",
  "promotion:recommend",
  "promotion:approve",
  "reward_policy:manage",
  "reward:recommend",
  "reward:approve",
  "reward:mark_paid",
  "ai:use",
  "ai:configure",
  "import:run",
  "integration:manage",
  "report:read",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Scope = "OWN" | "ORG_UNIT" | "ORG";

export interface Grant {
  readonly permission: Permission;
  readonly scope: Scope;
  /** materialized path of the assigned org unit, e.g. "/hq/branch-1/" — required for ORG_UNIT */
  readonly orgUnitPath?: string;
}

export interface Actor {
  readonly userId: string;
  readonly employeeId?: string;
  readonly grants: readonly Grant[];
}

/** What the API knows about the target of an action. Org-wide config has neither field. */
export interface ResourceRef {
  readonly orgUnitPath?: string;
  readonly ownerEmployeeId?: string;
}

function grantCovers(actor: Actor, g: Grant, r: ResourceRef): boolean {
  switch (g.scope) {
    case "ORG":
      return true;
    case "ORG_UNIT":
      return (
        g.orgUnitPath !== undefined && r.orgUnitPath !== undefined && r.orgUnitPath.startsWith(g.orgUnitPath)
      );
    case "OWN":
      return actor.employeeId !== undefined && r.ownerEmployeeId === actor.employeeId;
  }
}

/** Server-side authorization check. UI hiding is cosmetic; this is the rule. */
export function can(actor: Actor, permission: Permission, resource: ResourceRef = {}): boolean {
  return actor.grants.some((g) => g.permission === permission && grantCovers(actor, g, resource));
}

export interface DutyContext {
  /** user the decision is about (e.g. the employee's user account) */
  readonly subjectUserId?: string;
  /** user who created / proposed / scored the thing being approved */
  readonly proposerUserId?: string;
}

export type DutyViolation = "sod.self" | "sod.ownProposal";

/** Separation of duties (on by default, org-configurable): nobody approves about themselves or their own proposal. */
export function separationOfDuties(actor: Actor, ctx: DutyContext): DutyViolation[] {
  const v: DutyViolation[] = [];
  if (ctx.subjectUserId !== undefined && ctx.subjectUserId === actor.userId) v.push("sod.self");
  if (ctx.proposerUserId !== undefined && ctx.proposerUserId === actor.userId) v.push("sod.ownProposal");
  return v;
}

type RoleSpec = Readonly<Partial<Record<Permission, Scope>>>;

const ADMIN_ORG: Permission[] = PERMISSIONS.filter((p) => p !== "evidence:submit" && p !== "appeal:submit");

/** Default seeded roles (editable by admins) — docs/SECURITY.md §3. */
export const DEFAULT_ROLES: Readonly<Record<"admin" | "manager" | "employee", RoleSpec>> = {
  admin: Object.fromEntries(ADMIN_ORG.map((p) => [p, "ORG"])),
  manager: {
    "employee:read": "ORG_UNIT",
    "candidate:read": "ORG_UNIT",
    "candidate:manage": "ORG_UNIT",
    "assessment:conduct": "ORG_UNIT",
    "assessment:approve": "ORG_UNIT",
    "evidence:submit": "OWN",
    "evidence:verify": "ORG_UNIT",
    "appeal:submit": "OWN",
    "appeal:resolve": "ORG_UNIT",
    "promotion:recommend": "ORG_UNIT",
    "reward:recommend": "ORG_UNIT",
    "ai:use": "ORG_UNIT",
    "report:read": "ORG_UNIT",
  },
  employee: {
    "employee:read": "OWN",
    "evidence:submit": "OWN",
    "appeal:submit": "OWN",
    "compensation:read": "OWN",
  },
};

/** Expand a role spec into grants for one assignment. */
export function grantsFor(spec: RoleSpec, orgUnitPath?: string): Grant[] {
  return Object.entries(spec).map(([permission, scope]) =>
    scope === "ORG_UNIT" && orgUnitPath !== undefined
      ? { permission: permission as Permission, scope, orgUnitPath }
      : { permission: permission as Permission, scope },
  );
}
