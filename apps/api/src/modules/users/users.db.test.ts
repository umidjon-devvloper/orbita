import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type OrbitaApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { createPrisma, type PrismaClient } from "../../db/client.js";
import { TEST_URL } from "../../db/test-db.js";
import { createConsoleMailer } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { createLogger } from "../../logger.js";
import { seedDefaultRoles } from "../authz/role-seed.js";

let app: OrbitaApp;
let prisma: PrismaClient;

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_URL,
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  });
  prisma = createPrisma(TEST_URL);
  app = await buildApp({ config, logger: createLogger(config), prisma, mailer: createConsoleMailer() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function world() {
  const org = await prisma.organization.create({ data: { name: `Org ${randomUUID()}` } });
  const hq = await prisma.orgUnit.create({ data: { orgId: org.id, name: "HQ", path: "/hq/" } });
  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `admin+${randomUUID()}@example.uz`,
      passwordHash: await hashPassword("passw0rd-passw0rd"),
    },
  });
  const roles = await seedDefaultRoles(prisma, org.id);
  await prisma.roleAssignment.create({ data: { userId: admin.id, roleId: roles.admin, orgUnitId: null } });
  return { org, hq, admin, roles };
}

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "passw0rd-passw0rd" },
  });
  if (res.statusCode !== 200) throw new Error(`login ${res.statusCode}: ${res.payload}`);
  const set: unknown = res.headers["set-cookie"];
  const first: unknown = Array.isArray(set) ? (set.length > 0 ? set[0] : "") : set;
  return typeof first === "string" ? (first.split(";")[0] ?? "") : "";
}

describe("users", () => {
  it("admin creates a user with no password hash (reset flow sets it)", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const email = `new+${randomUUID()}@example.uz`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie },
      payload: { email },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json<{ user: { id: string; email: string } }>().user;
    expect(created.email).toBe(email);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.passwordHash).toBeNull();
    expect(row.status).toBe("ACTIVE");
  });

  it("rejects a duplicate email with 409", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const email = `dup+${randomUUID()}@example.uz`;
    await app.inject({ method: "POST", url: "/api/v1/users", headers: { cookie }, payload: { email } });
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie },
      payload: { email },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json<{ code: string }>().code).toBe("orbita:user:duplicate_email");
  });

  it("disabling a user deletes their sessions and blocks login", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const target = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `tgt+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    const targetCookie = await login(target.email);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${target.id}/status`,
      headers: { cookie },
      payload: { status: "DISABLED" },
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: targetCookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it("refuses to disable your own account", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${w.admin.id}/status`,
      headers: { cookie },
      payload: { status: "DISABLED" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:user:cannot_change_self_status");
  });

  it("non-admin cannot list or create users", async () => {
    const w = await world();
    const plain = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `plain+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: plain.id, roleId: w.roles.employee, orgUnitId: null },
    });
    const cookie = await login(plain.email);
    const list = await app.inject({ method: "GET", url: "/api/v1/users", headers: { cookie } });
    expect(list.statusCode).toBe(403);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie },
      payload: { email: `nope+${randomUUID()}@example.uz` },
    });
    expect(create.statusCode).toBe(403);
  });
});

describe("role assignments", () => {
  it("manager role requires orgUnitId; granting without one is a 400", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const target = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `mgr+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users/role-assignments",
      headers: { cookie },
      payload: { userId: target.id, roleId: w.roles.manager, orgUnitId: null },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:validation");
  });

  it("admin grants a scoped manager role and the audit is recorded", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const target = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `mgr+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users/role-assignments",
      headers: { cookie },
      payload: { userId: target.id, roleId: w.roles.manager, orgUnitId: w.hq.id },
    });
    expect(res.statusCode).toBe(200);
    const assignmentId = res.json<{ assignment: { id: string } }>().assignment.id;
    const audit = await prisma.auditEvent.findFirst({
      where: {
        orgId: w.org.id,
        action: "role_assignment.granted",
        entityId: assignmentId,
      },
    });
    expect(audit).not.toBeNull();

    // Revoke
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/role-assignments/${assignmentId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    expect(await prisma.roleAssignment.findUnique({ where: { id: assignmentId } })).toBeNull();
  });

  it("admin cannot revoke their own last role", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const own = await prisma.roleAssignment.findFirstOrThrow({ where: { userId: w.admin.id } });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/role-assignments/${own.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:role_assignment:cannot_revoke_last_self");
  });

  it("GET /users/roles lists seeded roles with their permissions", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({ method: "GET", url: "/api/v1/users/roles", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const keys = res
      .json<{ roles: { key: string; permissions: unknown[] }[] }>()
      .roles.map((r) => r.key)
      .sort();
    expect(keys).toEqual(["admin", "employee", "manager"]);
  });
});
