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
  const sales = await prisma.orgUnit.create({
    data: { orgId: org.id, parentId: hq.id, name: "sales", path: "/hq/sales/" },
  });
  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `admin+${randomUUID()}@example.uz`,
      passwordHash: await hashPassword("passw0rd-passw0rd"),
    },
  });
  const roles = await seedDefaultRoles(prisma, org.id);
  await prisma.roleAssignment.create({
    data: { userId: admin.id, roleId: roles.admin, orgUnitId: null },
  });
  return { org, hq, sales, admin, roles };
}

async function login(email: string): Promise<string> {
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

describe("org-units", () => {
  it("admin lists every unit in their org", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({ method: "GET", url: "/api/v1/org-units", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ units: { id: string; path: string }[] }>();
    const paths = body.units.map((u) => u.path);
    expect(paths).toEqual(expect.arrayContaining([w.hq.path, w.sales.path]));
  });

  it("creates a child unit and computes its materialized path", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/org-units",
      headers: { cookie },
      payload: { parentId: w.sales.id, name: "west" },
    });
    expect(res.statusCode).toBe(200);
    const unit = res.json<{ unit: { id: string; path: string; parentId: string } }>().unit;
    expect(unit.parentId).toBe(w.sales.id);
    expect(unit.path).toBe(`${w.sales.path}${unit.id}/`);
    const audit = await prisma.auditEvent.findFirst({
      where: { orgId: w.org.id, action: "org_unit.created", entityId: unit.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a unit without a name", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/org-units",
      headers: { cookie },
      payload: { parentId: null, name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reparent recomputes paths across the subtree atomically", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    // Build a 3-level tree under sales: sales > team > member
    const team = await prisma.orgUnit.create({
      data: {
        orgId: w.org.id,
        parentId: w.sales.id,
        name: "team",
        path: `${w.sales.path}${randomUUID()}/`,
      },
    });
    const member = await prisma.orgUnit.create({
      data: {
        orgId: w.org.id,
        parentId: team.id,
        name: "member",
        path: `${team.path}${randomUUID()}/`,
      },
    });
    const other = await prisma.orgUnit.create({
      data: { orgId: w.org.id, parentId: w.hq.id, name: "other", path: `${w.hq.path}other/` },
    });

    // Fix our hand-rolled rows so they match the service's expected shape.
    const teamSelf = `${w.sales.path}${team.id}/`;
    const memberSelf = `${teamSelf}${member.id}/`;
    await prisma.orgUnit.update({ where: { id: team.id }, data: { path: teamSelf } });
    await prisma.orgUnit.update({ where: { id: member.id }, data: { path: memberSelf } });

    // Move `team` under `other`.
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/org-units/${team.id}`,
      headers: { cookie },
      payload: { parentId: other.id },
    });
    expect(res.statusCode).toBe(200);
    const movedTeam = await prisma.orgUnit.findUniqueOrThrow({ where: { id: team.id } });
    const movedMember = await prisma.orgUnit.findUniqueOrThrow({ where: { id: member.id } });
    expect(movedTeam.path).toBe(`${other.path}${team.id}/`);
    expect(movedMember.path).toBe(`${movedTeam.path}${member.id}/`);
  });

  it("refuses to move a unit into its own subtree", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/org-units/${w.hq.id}`,
      headers: { cookie },
      payload: { parentId: w.sales.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:org_unit:cycle");
  });

  it("refuses to delete a unit with children", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/org-units/${w.hq.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe("orbita:org_unit:not_empty");
  });

  it("deletes an empty leaf unit and writes an audit row", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const leaf = await prisma.orgUnit.create({
      data: { orgId: w.org.id, parentId: w.sales.id, name: "leaf", path: `${w.sales.path}leaf/` },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/org-units/${leaf.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.orgUnit.findUnique({ where: { id: leaf.id } })).toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: { orgId: w.org.id, action: "org_unit.deleted", entityId: leaf.id },
    });
    expect(audit).not.toBeNull();
  });

  it("a user without org:manage gets 403 on list", async () => {
    const w = await world();
    const nonAdmin = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `plain+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: nonAdmin.id, roleId: w.roles.employee, orgUnitId: null },
    });
    const cookie = await login(nonAdmin.email);
    const res = await app.inject({ method: "GET", url: "/api/v1/org-units", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });
});
