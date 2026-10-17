// Smoke test: generated Prisma client ↔ migrated database (UUIDv7 ids, BigInt money, timestamptz, constraint errors).
import { afterAll, describe, expect, it } from "vitest";
import { createPrisma } from "./client.js";
import { TEST_URL } from "./test-db.js";

const prisma = createPrisma(TEST_URL);
afterAll(() => prisma.$disconnect());

describe("Prisma client against migrated schema", () => {
  it("round-trips an organization, a UZS salary band and a timestamptz", async () => {
    const org = await prisma.organization.create({ data: { name: "Smoke org", isDemo: true } });
    expect(org.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/); // UUIDv7
    expect(org.timezone).toBe("Asia/Tashkent");

    const specialty = await prisma.specialty.create({
      data: { orgId: org.id, key: "sales", name: { uz: "Savdo", ru: "Продажи" } },
    });
    const position = await prisma.position.create({
      data: { specialtyId: specialty.id, key: "manager", title: { uz: "Menejer" } },
    });
    const level = await prisma.careerLevel.create({
      data: { orgId: org.id, key: "middle", rank: 2, name: { uz: "Middle" } },
    });
    const band = await prisma.salaryBand.create({
      data: {
        positionId: position.id,
        levelId: level.id,
        minAmount: 5_000_000n,
        maxAmount: 7_000_000n,
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    expect(band.minAmount).toBe(5_000_000n);
    expect(band.approval).toBe("UNAPPROVED");

    const rows = await prisma.$queryRaw<
      { t: string }[]
    >`SELECT pg_typeof("createdAt")::text AS t FROM "Organization" WHERE id = ${org.id}::uuid`;
    expect(rows[0]?.t).toBe("timestamp with time zone");
  });

  it("surfaces database CHECK violations as errors", async () => {
    const org = await prisma.organization.create({ data: { name: "Check org" } });
    await expect(
      prisma.specialty.create({ data: { orgId: org.id, key: "x", name: { en: "No Uzbek" } } }),
    ).rejects.toThrow(/Specialty_name_uz|check/i);
  });
});
