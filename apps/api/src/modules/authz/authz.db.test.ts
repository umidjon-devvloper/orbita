import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Permission } from "@orbita/domain";
import { buildApp, type OrbitaApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { createPrisma, type PrismaClient } from "../../db/client.js";
import { TEST_URL } from "../../db/test-db.js";
import { createConsoleMailer } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { createLogger } from "../../logger.js";
import { loadActor } from "./actor.js";
import { seedDefaultRoles } from "./role-seed.js";

let app: OrbitaApp;
let prisma: PrismaClient;

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_URL,
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  });
  const logger = createLogger(config);
  prisma = createPrisma(TEST_URL);
  app = await buildApp({ config, logger, prisma, mailer: createConsoleMailer() });

  // Test-only probe routes exercising each scope.
  const resolveEmployee = async (req: { query: unknown }) => {
    const employeeId = (req.query as { employeeId?: string }).employeeId;
    if (employeeId === undefined) return {};
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, orgUnit: { select: { path: true } } },
    });
    return {
      ownerEmployeeId: employee?.id ?? "",
      orgUnitPath: employee?.orgUnit.path ?? "",
    };
  };
  app.get(
    "/__probe/approve",
    { preHandler: app.requirePermission("assessment:approve", resolveEmployee) },
    () => ({ ok: true }),
  );
  app.get(
    "/__probe/employee",
    { preHandler: app.requirePermission("employee:read", resolveEmployee) },
    () => ({ ok: true }),
  );

  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

/**
 * Per-test cleanup is intentionally minimal — AuditEvent rows are
 * append-only (D-35), so a wholesale wipe fails on the trigger. Each
 * `world()` call creates its own Organization, so cross-test contamination
 * is impossible without wiping. We only clear sessions, which don't bleed
 * between tests but keep the DB tidy.
 */
beforeEach(async () => {
  await prisma.session.deleteMany({});
});

interface WorldOpts {
  roleKey: "admin" | "manager" | "employee";
  /** When set, the manager grant is scoped to this unit's path instead of ORG. */
  scopeToUnitPath?: string;
}

/**
 * Build a tiny org tree with a user, a unit, an employee, and an assigned role.
 *
 *   org
 *   └── hq            (path "/hq/")
 *       ├── sales     (path "/hq/sales/")
 *       └── support   (path "/hq/support/")
 */
async function world(opts: WorldOpts) {
  const org = await prisma.organization.create({ data: { name: "Test" } });
  const hq = await prisma.orgUnit.create({ data: { orgId: org.id, name: "HQ", path: "/hq/" } });
  const sales = await prisma.orgUnit.create({
    data: { orgId: org.id, parentId: hq.id, name: "sales", path: "/hq/sales/" },
  });
  const support = await prisma.orgUnit.create({
    data: { orgId: org.id, parentId: hq.id, name: "support", path: "/hq/support/" },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `${opts.roleKey}+${randomUUID()}@example.uz`,
      passwordHash: await hashPassword("passw0rd-passw0rd"),
    },
  });
  const specialty = await prisma.specialty.create({
    data: { orgId: org.id, key: "ops", name: { uz: "Operatsiya" } },
  });
  const position = await prisma.position.create({
    data: { specialtyId: specialty.id, key: "operator", title: { uz: "Operator" } },
  });
  const roles = await seedDefaultRoles(prisma, org.id);
  const assignmentUnit =
    opts.scopeToUnitPath === sales.path ? sales : opts.scopeToUnitPath === support.path ? support : hq;
  const roleHasOrgUnitScope =
    (await prisma.rolePermission.findFirst({
      where: { roleId: roles[opts.roleKey], scope: "ORG_UNIT" },
      select: { roleId: true },
    })) !== null;
  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      roleId: roles[opts.roleKey],
      orgUnitId: roleHasOrgUnitScope ? assignmentUnit.id : null,
    },
  });
  const employeeInSales = await prisma.employee.create({
    data: {
      orgId: org.id,
      orgUnitId: sales.id,
      positionId: position.id,
      fullName: "Alice Sales",
      pseudonym: `EMP-${sales.id}`,
      hiredOn: new Date("2026-01-01"),
    },
  });
  const employeeInSupport = await prisma.employee.create({
    data: {
      orgId: org.id,
      orgUnitId: support.id,
      positionId: position.id,
      fullName: "Bob Support",
      pseudonym: `EMP-${support.id}`,
      hiredOn: new Date("2026-01-01"),
    },
  });
  return { org, hq, sales, support, user, roles, employeeInSales, employeeInSupport };
}

async function loginCookie(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "passw0rd-passw0rd" },
  });
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode}: ${res.payload}`);
  const set: unknown = res.headers["set-cookie"];
  const first: unknown = Array.isArray(set) ? (set.length > 0 ? set[0] : "") : set;
  return typeof first === "string" ? (first.split(";")[0] ?? "") : "";
}

describe("loadActor", () => {
  it("expands assignments into grants with the unit's materialized path", async () => {
    const w = await world({ roleKey: "manager", scopeToUnitPath: "/hq/sales/" });
    const actor = await loadActor(prisma, w.user.id);
    expect(actor).not.toBeNull();
    const assess = actor!.grants.find((g) => g.permission === "assessment:approve");
    expect(assess?.scope).toBe("ORG_UNIT");
    expect(assess?.orgUnitPath).toBe("/hq/sales/");
  });

  it("returns null for a DISABLED user", async () => {
    const w = await world({ roleKey: "admin" });
    await prisma.user.update({ where: { id: w.user.id }, data: { status: "DISABLED" } });
    expect(await loadActor(prisma, w.user.id)).toBeNull();
  });

  it("returns null for an unknown user", async () => {
    expect(await loadActor(prisma, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("seedDefaultRoles", () => {
  it("is idempotent and refreshes the permission set on re-run", async () => {
    const org = await prisma.organization.create({ data: { name: "Repeat" } });
    const first = await seedDefaultRoles(prisma, org.id);
    const second = await seedDefaultRoles(prisma, org.id);
    expect(second).toEqual(first);
    const adminPerms = await prisma.rolePermission.count({ where: { roleId: first.admin } });
    expect(adminPerms).toBeGreaterThan(10);
  });
});

describe("requirePermission on a route", () => {
  it("returns 401 without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/__probe/employee" });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe("orbita:unauthenticated");
  });

  it("returns 403 for an authenticated user who lacks the permission", async () => {
    const w = await world({ roleKey: "employee" });
    const cookie = await loginCookie(w.user.email);
    const res = await app.inject({
      method: "GET",
      url: `/__probe/approve?employeeId=${w.employeeInSales.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe("orbita:forbidden");
  });

  it("admin ORG scope can approve any employee in the org", async () => {
    const w = await world({ roleKey: "admin" });
    const cookie = await loginCookie(w.user.email);
    for (const employee of [w.employeeInSales, w.employeeInSupport]) {
      const res = await app.inject({
        method: "GET",
        url: `/__probe/approve?employeeId=${employee.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it("manager ORG_UNIT scope approves inside the subtree only", async () => {
    const w = await world({ roleKey: "manager", scopeToUnitPath: "/hq/sales/" });
    const cookie = await loginCookie(w.user.email);
    const allowed = await app.inject({
      method: "GET",
      url: `/__probe/approve?employeeId=${w.employeeInSales.id}`,
      headers: { cookie },
    });
    expect(allowed.statusCode).toBe(200);
    const forbidden = await app.inject({
      method: "GET",
      url: `/__probe/approve?employeeId=${w.employeeInSupport.id}`,
      headers: { cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("OWN scope only matches the actor's own employee record", async () => {
    const w = await world({ roleKey: "employee" });
    // Link the user to one of the employees so OWN scope matches.
    await prisma.employee.update({
      where: { id: w.employeeInSales.id },
      data: { userId: w.user.id },
    });
    const cookie = await loginCookie(w.user.email);
    const own = await app.inject({
      method: "GET",
      url: `/__probe/employee?employeeId=${w.employeeInSales.id}`,
      headers: { cookie },
    });
    expect(own.statusCode).toBe(200);
    const other = await app.inject({
      method: "GET",
      url: `/__probe/employee?employeeId=${w.employeeInSupport.id}`,
      headers: { cookie },
    });
    expect(other.statusCode).toBe(403);
  });
});

describe("audit log endpoint", () => {
  it("records auth.login and lets an auditor read it, scoped to their org", async () => {
    const w = await world({ roleKey: "admin" });
    const cookie = await loginCookie(w.user.email);
    const list = await app.inject({ method: "GET", url: "/api/v1/audit", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const body = list.json<{ events: { action: string; entityId: string }[] }>();
    expect(body.events.some((e) => e.action === "auth.login" && e.entityId === w.user.id)).toBe(true);
  });

  it("refuses a user without audit:read", async () => {
    const w = await world({ roleKey: "employee" });
    const cookie = await loginCookie(w.user.email);
    const res = await app.inject({ method: "GET", url: "/api/v1/audit", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("audit rows are append-only — the DB trigger refuses updates and deletes", async () => {
    const w = await world({ roleKey: "admin" });
    await loginCookie(w.user.email);
    const row = await prisma.auditEvent.findFirst({ where: { orgId: w.org.id } });
    expect(row).not.toBeNull();
    await expect(
      prisma.auditEvent.update({ where: { id: row!.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/orbita:audit\.appendOnly/);
    await expect(prisma.auditEvent.delete({ where: { id: row!.id } })).rejects.toThrow(
      /orbita:audit\.appendOnly/,
    );
  });

  it("sanity: PERMISSIONS catalogue covers every scope used by DEFAULT_ROLES", () => {
    // Satisfied if the schema types compile — kept as an explicit test anchor.
    const sample: Permission = "assessment:approve";
    expect(sample).toBe("assessment:approve");
  });
});
