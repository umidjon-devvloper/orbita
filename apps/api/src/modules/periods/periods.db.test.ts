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
  return { org, admin };
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

describe("periods", () => {
  it("creates a period and refuses an overlapping one", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-01-01", endsOn: "2026-01-31" },
    });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-01-15", endsOn: "2026-02-15" },
    });
    expect(b.statusCode).toBe(409);
    expect(b.json<{ code: string }>().code).toBe("orbita:period:overlap");
  });

  it("allows adjacent periods (day after)", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-01-01", endsOn: "2026-01-31" },
    });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-02-01", endsOn: "2026-02-28" },
    });
    expect(b.statusCode).toBe(200);
  });

  it("enforces status transitions OPEN → CLOSED → FINALIZED and refuses skips", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-03-01", endsOn: "2026-03-31" },
    });
    const id = create.json<{ period: { id: string } }>().period.id;
    const skip = await app.inject({
      method: "PATCH",
      url: `/api/v1/periods/${id}/status`,
      headers: { cookie },
      payload: { status: "FINALIZED" },
    });
    expect(skip.statusCode).toBe(409);
    const close = await app.inject({
      method: "PATCH",
      url: `/api/v1/periods/${id}/status`,
      headers: { cookie },
      payload: { status: "CLOSED" },
    });
    expect(close.statusCode).toBe(200);
    const finalize = await app.inject({
      method: "PATCH",
      url: `/api/v1/periods/${id}/status`,
      headers: { cookie },
      payload: { status: "FINALIZED" },
    });
    expect(finalize.statusCode).toBe(200);
    // FINALIZED is terminal.
    const reopen = await app.inject({
      method: "PATCH",
      url: `/api/v1/periods/${id}/status`,
      headers: { cookie },
      payload: { status: "OPEN" },
    });
    expect(reopen.statusCode).toBe(409);
  });

  it("rejects endsOn before startsOn", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/periods",
      headers: { cookie },
      payload: { startsOn: "2026-05-01", endsOn: "2026-04-01" },
    });
    expect(res.statusCode).toBe(400);
  });
});
