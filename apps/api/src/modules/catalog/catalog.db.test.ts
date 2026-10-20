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

async function worldWithAdmin() {
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

describe("catalog", () => {
  it("creates and lists a specialty with localized name", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const key = `spec-${randomUUID().slice(0, 8)}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: {
        key,
        name: { uz: "Mijozlarni qo'llab-quvvatlash", ru: "Поддержка", en: "Support" },
      },
    });
    expect(res.statusCode).toBe(200);
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
    });
    const items = list.json<{ specialties: { key: string; name: { uz: string } }[] }>().specialties;
    expect(items.find((s) => s.key === key)?.name.uz).toBe("Mijozlarni qo'llab-quvvatlash");
  });

  it("rejects a duplicate specialty key with 409", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const key = `spec-${randomUUID().slice(0, 8)}`;
    await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: { key, name: { uz: "A" } },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: { key, name: { uz: "B" } },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json<{ code: string }>().code).toBe("orbita:catalog:duplicate_key");
  });

  it("PATCH merges localized names — a ru-only patch keeps uz", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: { key: `spec-${randomUUID().slice(0, 8)}`, name: { uz: "Operator" } },
    });
    const id = create.json<{ specialty: { id: string } }>().specialty.id;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/catalog/specialties/${id}`,
      headers: { cookie },
      payload: { name: { ru: "Оператор" } },
    });
    expect(patch.statusCode).toBe(200);
    const row = await prisma.specialty.findUniqueOrThrow({ where: { id } });
    expect(row.name).toEqual({ uz: "Operator", ru: "Оператор" });
  });

  it("binds a competency to a position with importance", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const spec = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: { key: `spec-${randomUUID().slice(0, 8)}`, name: { uz: "QA" } },
    });
    const specialtyId = spec.json<{ specialty: { id: string } }>().specialty.id;
    const pos = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/positions",
      headers: { cookie },
      payload: { specialtyId, key: `tester-${randomUUID().slice(0, 8)}`, title: { uz: "Tester" } },
    });
    const positionId = pos.json<{ position: { id: string } }>().position.id;
    const comp = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/competencies",
      headers: { cookie },
      payload: { key: `privacy-${randomUUID().slice(0, 8)}`, name: { uz: "Maxfiylik" } },
    });
    const competencyId = comp.json<{ competency: { id: string } }>().competency.id;
    const link = await app.inject({
      method: "POST",
      url: `/api/v1/catalog/positions/${positionId}/competencies`,
      headers: { cookie },
      payload: { competencyId, importance: 3 },
    });
    expect(link.statusCode).toBe(204);
    const row = await prisma.positionCompetency.findUniqueOrThrow({
      where: { positionId_competencyId: { positionId, competencyId } },
    });
    expect(row.importance).toBe(3);
  });

  it("non-admin cannot touch the catalog", async () => {
    const w = await worldWithAdmin();
    const roles = await seedDefaultRoles(prisma, w.org.id);
    const plain = await prisma.user.create({
      data: {
        orgId: w.org.id,
        email: `plain+${randomUUID()}@example.uz`,
        passwordHash: await hashPassword("passw0rd-passw0rd"),
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: plain.id, roleId: roles.employee, orgUnitId: null },
    });
    const cookie = await login(plain.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/catalog/specialties",
      headers: { cookie },
      payload: { key: "x", name: { uz: "x" } },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("career levels", () => {
  it("creates levels with sequential ranks and reorders atomically", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const names = ["jr", "md", "sr"];
    const ids: string[] = [];
    for (const n of names) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/levels",
        headers: { cookie },
        payload: { key: `${n}-${randomUUID().slice(0, 8)}`, name: { uz: n.toUpperCase() } },
      });
      expect(res.statusCode).toBe(200);
      ids.push(res.json<{ level: { id: string; rank: number } }>().level.id);
    }
    const beforeList = await app.inject({ method: "GET", url: "/api/v1/levels", headers: { cookie } });
    const beforeRows = beforeList.json<{ levels: { id: string; rank: number }[] }>().levels;
    expect(beforeRows.map((r) => r.id)).toEqual(ids);

    // Reverse the order.
    const reorder = await app.inject({
      method: "POST",
      url: "/api/v1/levels/reorder",
      headers: { cookie },
      payload: { orderedIds: [...ids].reverse() },
    });
    expect(reorder.statusCode).toBe(204);
    const afterList = await app.inject({ method: "GET", url: "/api/v1/levels", headers: { cookie } });
    const afterRows = afterList.json<{ levels: { id: string; rank: number }[] }>().levels;
    expect(afterRows.map((r) => r.id)).toEqual([...ids].reverse());
    expect(afterRows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("new level is UNAPPROVED and the approve endpoint flips it", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/levels",
      headers: { cookie },
      payload: { key: `lvl-${randomUUID().slice(0, 8)}`, name: { uz: "Jr" } },
    });
    const id = create.json<{ level: { id: string; approval: string } }>().level.id;
    expect(create.json<{ level: { approval: string } }>().level.approval).toBe("UNAPPROVED");
    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/levels/${id}/approve`,
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(204);
    const row = await prisma.careerLevel.findUniqueOrThrow({ where: { id } });
    expect(row.approval).toBe("APPROVED");
  });

  it("upserting a level requirement rejects out-of-range score", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const specialty = await prisma.specialty.create({
      data: { orgId: w.org.id, key: `sp-${randomUUID().slice(0, 8)}`, name: { uz: "x" } },
    });
    const competency = await prisma.competency.create({
      data: { orgId: w.org.id, key: `co-${randomUUID().slice(0, 8)}`, name: { uz: "y" } },
    });
    const level = await prisma.careerLevel.create({
      data: { orgId: w.org.id, key: `l-${randomUUID().slice(0, 8)}`, rank: 99, name: { uz: "Jr" } },
    });
    const bad = await app.inject({
      method: "PUT",
      url: `/api/v1/levels/${level.id}/requirements`,
      headers: { cookie },
      payload: {
        specialtyId: specialty.id,
        competencyId: competency.id,
        minScore: 99999,
        isGate: true,
      },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: "PUT",
      url: `/api/v1/levels/${level.id}/requirements`,
      headers: { cookie },
      payload: {
        specialtyId: specialty.id,
        competencyId: competency.id,
        minScore: 7500,
        isGate: true,
      },
    });
    expect(ok.statusCode).toBe(204);
  });
});

describe("salary bands", () => {
  async function seedPL(orgId: string) {
    const specialty = await prisma.specialty.create({
      data: { orgId, key: `s-${randomUUID().slice(0, 8)}`, name: { uz: "x" } },
    });
    const position = await prisma.position.create({
      data: { specialtyId: specialty.id, key: `p-${randomUUID().slice(0, 8)}`, title: { uz: "p" } },
    });
    const level = await prisma.careerLevel.create({
      data: { orgId, key: `l-${randomUUID().slice(0, 8)}`, rank: 1, name: { uz: "Jr" } },
    });
    return { positionId: position.id, levelId: level.id };
  }

  it("creates a band and refuses an overlapping one", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const { positionId, levelId } = await seedPL(w.org.id);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: "5000000",
        maxAmount: "7000000",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
      },
    });
    expect(first.statusCode).toBe(200);
    const overlap = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: "6000000",
        maxAmount: "8000000",
        effectiveFrom: "2026-06-01",
        effectiveTo: null,
      },
    });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json<{ code: string }>().code).toBe("orbita:salary_band:overlap");
  });

  it("adjacent (non-overlapping) windows are allowed", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const { positionId, levelId } = await seedPL(w.org.id);
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: 5000000,
        maxAmount: 7000000,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-06-30",
      },
    });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: 6000000,
        maxAmount: 8000000,
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
    });
    expect(b.statusCode).toBe(200);
  });

  it("rejects maxAmount < minAmount", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const { positionId, levelId } = await seedPL(w.org.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: 8000000,
        maxAmount: 5000000,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("close() extends effectiveTo and does not require re-approval", async () => {
    const w = await worldWithAdmin();
    const cookie = await login(w.admin.email);
    const { positionId, levelId } = await seedPL(w.org.id);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/salary-bands",
      headers: { cookie },
      payload: {
        positionId,
        levelId,
        minAmount: 5000000,
        maxAmount: 7000000,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    });
    const id = create.json<{ band: { id: string } }>().band.id;
    const close = await app.inject({
      method: "POST",
      url: `/api/v1/salary-bands/${id}/close`,
      headers: { cookie },
      payload: { effectiveTo: "2026-12-31" },
    });
    expect(close.statusCode).toBe(200);
    const row = await prisma.salaryBand.findUniqueOrThrow({ where: { id } });
    expect(row.effectiveTo?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});
