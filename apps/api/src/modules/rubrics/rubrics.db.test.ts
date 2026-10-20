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
  const specialty = await prisma.specialty.create({
    data: { orgId: org.id, key: `sp-${randomUUID().slice(0, 8)}`, name: { uz: "QA" } },
  });
  return { org, admin, specialty };
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

async function createRubricAndVersion(cookie: string, specialtyId: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/rubrics",
    headers: { cookie },
    payload: { specialtyId, purpose: "PERFORMANCE", name: { uz: "Oylik" } },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ rubric: { id: string }; versionId: string }>();
}

async function addCriterion(cookie: string, versionId: string, body: object) {
  return app.inject({
    method: "PUT",
    url: `/api/v1/rubrics/versions/${versionId}/criteria`,
    headers: { cookie },
    payload: body,
  });
}

describe("rubrics", () => {
  it("creates a rubric with a fresh DRAFT v1", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const out = await createRubricAndVersion(cookie, w.specialty.id);
    const list = await app.inject({ method: "GET", url: "/api/v1/rubrics", headers: { cookie } });
    const found = list
      .json<{ rubrics: { id: string; versions: { id: string; version: number; status: string }[] }[] }>()
      .rubrics.find((r) => r.id === out.rubric.id);
    expect(found?.versions).toHaveLength(1);
    expect(found?.versions[0]?.version).toBe(1);
    expect(found?.versions[0]?.status).toBe("DRAFT");
  });

  it("rejects a second rubric with the same (specialty, purpose)", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    await createRubricAndVersion(cookie, w.specialty.id);
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/rubrics",
      headers: { cookie },
      payload: { specialtyId: w.specialty.id, purpose: "PERFORMANCE", name: { uz: "Oylik 2" } },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json<{ code: string }>().code).toBe("orbita:rubric:duplicate_purpose");
  });

  it("refuses activation when weights don't sum to 10000", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const r = await createRubricAndVersion(cookie, w.specialty.id);
    await addCriterion(cookie, r.versionId, {
      key: "quality",
      name: { uz: "Sifat" },
      weightBp: 3000,
      method: "MANUAL",
    });
    await addCriterion(cookie, r.versionId, {
      key: "volume",
      name: { uz: "Hajm" },
      weightBp: 3000,
      method: "MANUAL",
    });
    const activate = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/activate`,
      headers: { cookie },
    });
    expect(activate.statusCode).toBe(400);
    expect(activate.json<{ code: string }>().code).toBe("orbita:rubric_version:invalid");
  });

  it("activates a valid DRAFT and retires any prior ACTIVE in the same tx", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const r = await createRubricAndVersion(cookie, w.specialty.id);
    await addCriterion(cookie, r.versionId, {
      key: "quality",
      name: { uz: "Sifat" },
      weightBp: 5000,
      method: "MANUAL",
    });
    await addCriterion(cookie, r.versionId, {
      key: "volume",
      name: { uz: "Hajm" },
      weightBp: 5000,
      method: "MANUAL",
    });
    const a1 = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/activate`,
      headers: { cookie },
    });
    expect(a1.statusCode).toBe(200);
    expect(a1.json<{ version: { status: string } }>().version.status).toBe("ACTIVE");

    // Clone and activate v2 → v1 should be RETIRED.
    const clone = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/clone`,
      headers: { cookie },
      payload: { changeNote: "rebalance" },
    });
    const v2Id = clone.json<{ version: { id: string } }>().version.id;
    const a2 = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${v2Id}/activate`,
      headers: { cookie },
    });
    expect(a2.statusCode).toBe(200);
    const v1 = await prisma.rubricVersion.findUniqueOrThrow({ where: { id: r.versionId } });
    expect(v1.status).toBe("RETIRED");
  });

  it("refuses to edit a non-DRAFT version", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const r = await createRubricAndVersion(cookie, w.specialty.id);
    await addCriterion(cookie, r.versionId, {
      key: "quality",
      name: { uz: "Sifat" },
      weightBp: 10000,
      method: "MANUAL",
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/activate`,
      headers: { cookie },
    });
    const bad = await addCriterion(cookie, r.versionId, {
      key: "newone",
      name: { uz: "Yangi" },
      weightBp: 1000,
      method: "MANUAL",
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json<{ code: string }>().code).toBe("orbita:rubric_version:not_draft");
  });

  it("clone copies criteria into a fresh DRAFT with the next version number", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const r = await createRubricAndVersion(cookie, w.specialty.id);
    await addCriterion(cookie, r.versionId, {
      key: "quality",
      name: { uz: "Sifat" },
      weightBp: 10000,
      method: "MANUAL",
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/activate`,
      headers: { cookie },
    });
    const clone = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/clone`,
      headers: { cookie },
      payload: {},
    });
    expect(clone.statusCode).toBe(200);
    const v = clone.json<{ version: { version: number; status: string; criteria: { key: string }[] } }>()
      .version;
    expect(v.version).toBe(2);
    expect(v.status).toBe("DRAFT");
    expect(v.criteria.map((c) => c.key)).toEqual(["quality"]);
  });

  it("gate criterion without gateMinScore is rejected at activation", async () => {
    const w = await world();
    const cookie = await login(w.admin.email);
    const r = await createRubricAndVersion(cookie, w.specialty.id);
    await addCriterion(cookie, r.versionId, {
      key: "quality",
      name: { uz: "Sifat" },
      weightBp: 10000,
      method: "MANUAL",
      isGate: true,
    });
    const activate = await app.inject({
      method: "POST",
      url: `/api/v1/rubrics/versions/${r.versionId}/activate`,
      headers: { cookie },
    });
    expect(activate.statusCode).toBe(400);
  });
});
