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

async function world() {
  const org = await prisma.organization.create({ data: { name: `Org ${randomUUID()}` } });
  const unit = await prisma.orgUnit.create({ data: { orgId: org.id, name: "HQ", path: "/hq/" } });
  const specialty = await prisma.specialty.create({
    data: { orgId: org.id, key: `s-${randomUUID().slice(0, 8)}`, name: { uz: "x" } },
  });
  const position = await prisma.position.create({
    data: { specialtyId: specialty.id, key: `p-${randomUUID().slice(0, 8)}`, title: { uz: "p" } },
  });
  const roles = await seedDefaultRoles(prisma, org.id);
  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `admin+${randomUUID()}@example.uz`,
      passwordHash: await hashPassword("passw0rd-passw0rd"),
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: admin.id, roleId: roles.admin, orgUnitId: null },
  });
  const period = await prisma.performancePeriod.create({
    data: { orgId: org.id, startsOn: new Date("2026-01-01"), endsOn: new Date("2026-01-31") },
  });
  const employee = await prisma.employee.create({
    data: {
      orgId: org.id,
      orgUnitId: unit.id,
      positionId: position.id,
      fullName: "Target",
      pseudonym: `EMP-${randomUUID()}`,
      hiredOn: new Date("2025-01-01"),
    },
  });
  return { org, admin, period, employee };
}

async function makeManager(orgId: string, suffix: string) {
  const roles = await seedDefaultRoles(prisma, orgId);
  const user = await prisma.user.create({
    data: {
      orgId,
      email: `mgr+${suffix}@example.uz`,
      passwordHash: await hashPassword("passw0rd-passw0rd"),
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: user.id, roleId: roles.admin, orgUnitId: null },
  });
  return user;
}

describe("evidence", () => {
  it("submits evidence and lists it under the right filter", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "SERVICE_RECORD",
        title: "Pasport beruvdim",
        occurredOn: "2026-01-10",
        serviceFee: "60000",
        governmentFee: "0",
      },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json<{ evidence: { id: string; status: string } }>().evidence.id;
    expect(res.json<{ evidence: { status: string } }>().evidence.status).toBe("SUBMITTED");
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/evidence?periodId=${w.period.id}&status=SUBMITTED`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ evidence: { id: string }[] }>().evidence.map((e) => e.id)).toContain(id);
  });

  it("refuses submission to a non-OPEN period", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    await prisma.performancePeriod.update({ where: { id: w.period.id }, data: { status: "CLOSED" } });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "TRAINING",
        title: "Docker course",
        occurredOn: "2026-01-10",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe("orbita:evidence:period_closed");
  });

  it("refuses an unknown evidence type", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "SOMETHING",
        title: "x",
        occurredOn: "2026-01-10",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("verify by another user transitions SUBMITTED → VERIFIED and sets verifier/time", async () => {
    const w = await world();
    const cookieA = await login(w.admin.email);
    // Submit as admin.
    const subm = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie: cookieA },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "SALE",
        title: "Pacage",
        occurredOn: "2026-01-10",
        serviceFee: 50000,
      },
    });
    const id = subm.json<{ evidence: { id: string } }>().evidence.id;
    // Verify as a second admin so SoD does not block.
    const other = await makeManager(w.org.id, randomUUID().slice(0, 8));
    const cookieB = await login(other.email);
    const ver = await app.inject({
      method: "POST",
      url: `/api/v1/evidence/${id}/verify`,
      headers: { cookie: cookieB },
    });
    expect(ver.statusCode).toBe(200);
    const row = await prisma.evidence.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("VERIFIED");
    expect(row.verifiedById).toBe(other.id);
    expect(row.verifiedAt).not.toBeNull();
  });

  it("refuses self-verification (separation of duties)", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const subm = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "SALE",
        title: "Self",
        occurredOn: "2026-01-10",
      },
    });
    const id = subm.json<{ evidence: { id: string } }>().evidence.id;
    const ver = await app.inject({
      method: "POST",
      url: `/api/v1/evidence/${id}/verify`,
      headers: { cookie },
    });
    expect(ver.statusCode).toBe(403);
    expect(ver.json<{ code: string }>().code).toBe("orbita:evidence:sod_self");
  });

  it("reject requires a reason and refuses on non-SUBMITTED", async () => {
    const w = await world();
    const cookieA = await login(w.admin.email);
    const subm = await app.inject({
      method: "POST",
      url: "/api/v1/evidence",
      headers: { cookie: cookieA },
      payload: {
        employeeId: w.employee.id,
        periodId: w.period.id,
        type: "TRAINING",
        title: "Course",
        occurredOn: "2026-01-10",
      },
    });
    const id = subm.json<{ evidence: { id: string } }>().evidence.id;
    const other = await makeManager(w.org.id, randomUUID().slice(0, 8));
    const cookieB = await login(other.email);
    const empty = await app.inject({
      method: "POST",
      url: `/api/v1/evidence/${id}/reject`,
      headers: { cookie: cookieB },
      payload: { reason: "" },
    });
    expect(empty.statusCode).toBe(400);
    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/evidence/${id}/reject`,
      headers: { cookie: cookieB },
      payload: { reason: "Not clear enough" },
    });
    expect(ok.statusCode).toBe(200);
    // Second reject on REJECTED → 409.
    const twice = await app.inject({
      method: "POST",
      url: `/api/v1/evidence/${id}/reject`,
      headers: { cookie: cookieB },
      payload: { reason: "again" },
    });
    expect(twice.statusCode).toBe(409);
  });
});
