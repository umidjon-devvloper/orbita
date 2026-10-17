// Test database helpers for *.db.test.ts. Uses DATABASE_URL_TEST (a disposable database).
import { randomUUID } from "node:crypto";
import pg from "pg";

export const TEST_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://orbita:orbita_dev_only@127.0.0.1:5432/orbita_test";

/** Drop and recreate the test database, then apply all migrations. Called once from globalSetup. */
export async function resetTestDatabase(): Promise<void> {
  const url = new URL(TEST_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(dbName))
    throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const admin = new URL(TEST_URL);
  admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  try {
    await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await c.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await c.end();
  }
  // @ts-expect-error — plain ESM script without type declarations
  const { deploy } = (await import("../../scripts/schema-engine-wasm.mjs")) as {
    deploy: (u: string) => Promise<string[]>;
  };
  await deploy(TEST_URL);
}

export const id = (): string => randomUUID();

/** Runs a test body inside a transaction that is always rolled back. */
export async function inRollback(fn: (db: Db) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    await fn(new Db(client));
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

export class Db {
  constructor(readonly client: pg.Client) {}

  /** Insert a row; returns its id. Column names are quoted as-is. */
  async insert(table: string, row: Record<string, unknown>): Promise<string> {
    const r: Record<string, unknown> & { id: string } = { id: id(), ...row };
    const cols = Object.keys(r);
    const values = Object.values(r).map((v: unknown) =>
      v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v,
    );
    await this.client.query(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
      values,
    );
    return r.id;
  }

  async exec(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
    return this.client.query(sql, params);
  }

  /** Expect the statement to fail; returns the error message. Uses a savepoint so the test can continue. */
  async rejects(sql: string, params: unknown[] = []): Promise<string> {
    await this.client.query("SAVEPOINT expect_fail");
    try {
      await this.client.query(sql, params);
    } catch (e) {
      await this.client.query("ROLLBACK TO SAVEPOINT expect_fail");
      return e instanceof Error ? e.message : String(e);
    }
    await this.client.query("RELEASE SAVEPOINT expect_fail");
    throw new Error(`Expected failure but statement succeeded: ${sql}`);
  }

  async rejectsInsert(table: string, row: Record<string, unknown>): Promise<string> {
    await this.client.query("SAVEPOINT expect_fail_insert");
    try {
      await this.insert(table, row);
    } catch (e) {
      await this.client.query("ROLLBACK TO SAVEPOINT expect_fail_insert");
      return e instanceof Error ? e.message : String(e);
    }
    throw new Error(`Expected insert into ${table} to fail`);
  }
}

const now = new Date("2026-10-18T00:00:00Z");
const uz = (text: string) => ({ uz: text });

/** Minimal connected world: org → unit → user → specialty/position/competency → level → rubric v1 → employee → period. */
export async function seedWorld(db: Db) {
  const orgId = await db.insert("Organization", { name: "Test org", updatedAt: now });
  const unitId = await db.insert("OrgUnit", { orgId, name: "HQ", path: "/hq/" });
  const userId = await db.insert("User", { orgId, email: "Manager@Example.uz", updatedAt: now });
  const specialtyId = await db.insert("Specialty", {
    orgId,
    key: "support",
    name: uz("Mijozlarni qo'llab-quvvatlash"),
    updatedAt: now,
  });
  const positionId = await db.insert("Position", { specialtyId, key: "operator", title: uz("Operator") });
  const competencyId = await db.insert("Competency", { orgId, key: "privacy", name: uz("Maxfiylik") });
  const levelId = await db.insert("CareerLevel", {
    orgId,
    key: "junior",
    rank: 1,
    name: uz("Junior"),
    updatedAt: now,
  });
  const rubricId = await db.insert("Rubric", { specialtyId, purpose: "PERFORMANCE", name: uz("Oylik") });
  const versionId = await db.insert("RubricVersion", {
    rubricId,
    version: 1,
    status: "ACTIVE",
    createdById: userId,
  });
  const criterionId = await db.insert("RubricCriterion", {
    rubricVersionId: versionId,
    key: "quality",
    name: uz("Sifat"),
    weightBp: 10000,
    method: "MANUAL",
  });
  const employeeId = await db.insert("Employee", {
    orgId,
    orgUnitId: unitId,
    positionId,
    fullName: "Test Employee",
    pseudonym: `EMP-${id().slice(0, 8)}`,
    hiredOn: "2025-01-01",
    updatedAt: now,
  });
  const periodId = await db.insert("PerformancePeriod", {
    orgId,
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
  });
  return {
    orgId,
    unitId,
    userId,
    specialtyId,
    positionId,
    competencyId,
    levelId,
    rubricId,
    versionId,
    criterionId,
    employeeId,
    periodId,
    now,
  };
}
export type World = Awaited<ReturnType<typeof seedWorld>>;

export async function performanceAssessment(db: Db, w: World, status = "DRAFT"): Promise<string> {
  return db.insert("Assessment", {
    orgId: w.orgId,
    kind: "PERFORMANCE",
    rubricVersionId: w.versionId,
    employeeId: w.employeeId,
    periodId: w.periodId,
    status,
    updatedAt: w.now,
  });
}
