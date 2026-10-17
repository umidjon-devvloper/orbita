#!/usr/bin/env node
// Fallback migration runner built on Prisma's own schema engine compiled to WASM
// (@prisma/schema-engine-wasm, pinned to the exact engine build of the installed Prisma CLI).
//
// Why: the Prisma CLI downloads a native schema-engine binary from binaries.prisma.sh. Where that
// host is unreachable (restricted CI, sandboxes), `prisma migrate` cannot run — and with a missing
// binary, `prisma migrate diff` can even exit 0 with empty output. This script produces the same
// migration files and the same `_prisma_migrations` bookkeeping, so the normal CLI keeps working
// on machines that do have the binary.
//
// Diffs are computed schema-to-schema: every migration created here stores `schema.snapshot.prisma`,
// the datamodel it brings the database to. (Introspecting a live database through the pg driver
// adapter fails in this engine build on Postgres' internal "char" type, and a schema-to-schema diff
// needs no database at all.) Hand-written SQL migrations (constraints, triggers) carry no snapshot
// and are invisible to the diff, exactly as with `prisma migrate dev`.
//
// `deploy` does not use the engine: its adapter path splits scripts on ";" and breaks on plpgsql
// "$$" bodies, applying migrations partially. Instead each migration runs in ONE transaction via
// pg's simple-query protocol, recorded in `_prisma_migrations` exactly as Prisma records it
// (checksum = sha256 of migration.sql), under Prisma's advisory lock id.
//
// Usage (from apps/api, DATABASE_URL set):
//   node scripts/schema-engine-wasm.mjs create <name>   # diff migrations → schema, write a new migration
//   node scripts/schema-engine-wasm.mjs deploy          # apply pending migrations
//   node scripts/schema-engine-wasm.mjs check           # exit 1 if schema and migrations differ
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
import { SchemaEngine } from "@prisma/schema-engine-wasm";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");
const migrationsDir = join(root, "prisma", "migrations");
const filters = { externalTables: [], externalEnums: [] };

export function loadMigrations(dir = migrationsDir) {
  const lockPath = join(dir, "migration_lock.toml");
  const dirs = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  return {
    baseDir: dir,
    lockfile: {
      path: "migration_lock.toml",
      content: existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null,
    },
    shadowDbInitScript: "",
    migrationDirectories: dirs.map((name) => {
      const file = join(dir, name, "migration.sql");
      return {
        path: name,
        migrationFile: {
          path: "migration.sql",
          content: existsSync(file)
            ? { tag: "ok", value: readFileSync(file, "utf8") }
            : { tag: "error", value: "missing migration.sql" },
        },
      };
    }),
  };
}

export async function openEngine(url) {
  const content = readFileSync(schemaPath, "utf8");
  const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg({ connectionString: url }));
  const engine = await SchemaEngine.new({ datamodels: [[schemaPath, content]] }, () => {}, adapter);
  return { engine, schema: { files: [{ path: schemaPath, content }] } };
}

/** Latest schema snapshot stored next to a migration, or null if none exists yet. */
export function latestSnapshot(dir = migrationsDir) {
  const withSnapshot = loadMigrations(dir)
    .migrationDirectories.map((m) => join(dir, m.path, "schema.snapshot.prisma"))
    .filter((f) => existsSync(f));
  const last = withSnapshot.at(-1);
  return last === undefined ? null : { path: last, content: readFileSync(last, "utf8") };
}

export async function pendingDiff(url) {
  const { engine, schema } = await openEngine(url);
  const snap = latestSnapshot();
  const res = await engine.diff({
    from: snap === null ? { tag: "empty" } : { tag: "schemaDatamodel", files: [snap] },
    to: { tag: "schemaDatamodel", ...schema },
    script: true,
    exitCode: null,
    filters,
  });
  const sql = (res.stdout ?? "").trim();
  return sql === "" || sql === "-- This is an empty migration." ? "" : sql;
}

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;
const PRISMA_ADVISORY_LOCK = 72707369;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Apply pending migrations; each one atomically. Returns applied names. */
export async function deploy(url, dir = migrationsDir) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [PRISMA_ADVISORY_LOCK]);
    await client.query(MIGRATIONS_TABLE);
    const { rows } = await client.query(
      `SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    );
    const failed = rows.filter((r) => r.finished_at === null);
    if (failed.length)
      throw new Error(
        `Failed migration(s) need manual resolution: ${failed.map((r) => r.migration_name).join(", ")}`,
      );
    const done = new Map(rows.map((r) => [r.migration_name, r.checksum]));
    const applied = [];
    for (const m of loadMigrations(dir).migrationDirectories) {
      if (m.migrationFile.content.tag !== "ok")
        throw new Error(`${m.path}: ${m.migrationFile.content.value}`);
      const sql = m.migrationFile.content.value;
      const checksum = sha256(sql);
      if (done.has(m.path)) {
        if (done.get(m.path) !== checksum)
          throw new Error(`${m.path} was modified after it was applied (checksum mismatch)`);
        continue;
      }
      const id = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, now(), now(), 1)`,
          [id, checksum, m.path],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(
          `${m.path} failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        );
      }
      applied.push(m.path);
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [PRISMA_ADVISORY_LOCK]).catch(() => {});
    await client.end();
  }
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

async function main() {
  const [cmd, name] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (cmd === "create") {
    if (!name || !/^[a-z0-9_]+$/.test(name)) throw new Error("usage: create <snake_case_name>");
    const sql = await pendingDiff(url);
    if (sql === "") return console.log("No schema changes — nothing to create.");
    if (!existsSync(join(migrationsDir, "migration_lock.toml")))
      writeFileSync(join(migrationsDir, "migration_lock.toml"), 'provider = "postgresql"\n');
    const dir = join(migrationsDir, `${timestamp()}_${name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "migration.sql"), sql + "\n");
    writeFileSync(join(dir, "schema.snapshot.prisma"), readFileSync(schemaPath, "utf8"));
    return console.log(`Created ${dir}`);
  }
  if (cmd === "deploy") {
    const applied = await deploy(url);
    return console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  }
  if (cmd === "check") {
    const sql = await pendingDiff(url);
    if (sql !== "") {
      console.error("Schema and migrations differ. Pending SQL:\n" + sql);
      process.exit(1);
    }
    return console.log("Schema and migrations are in sync.");
  }
  throw new Error("usage: create <name> | deploy | check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
