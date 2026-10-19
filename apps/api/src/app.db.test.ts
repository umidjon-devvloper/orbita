import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type OrbitaApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createPrisma, type PrismaClient } from "./db/client.js";
import { TEST_URL } from "./db/test-db.js";
import { Errors } from "./errors.js";

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
  app = await buildApp({ config, logger, prisma });

  // A tiny route added only in the test exercises the error handler.
  app.get("/__boom", () => {
    throw Errors.notFound("Employee");
  });
  app.get("/__crash", () => {
    throw new Error("boom");
  });
  app.get("/__zod", () => {
    z.object({ x: z.number() }).parse({ x: "nope" });
    return { ok: true };
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("app skeleton", () => {
  it("GET /api/v1/healthz returns 200 and echoes a request id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("GET /api/v1/readyz returns 200 after a successful SELECT 1", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("echoes a safe inbound X-Request-Id back on the response", async () => {
    const id = "req-abc-123";
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz", headers: { "x-request-id": id } });
    expect(res.headers["x-request-id"]).toBe(id);
  });

  it("ignores a hostile inbound X-Request-Id and mints a fresh one", async () => {
    const nasty = "a\u0007b"; // contains a control char
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/healthz",
      headers: { "x-request-id": nasty },
    });
    expect(res.headers["x-request-id"]).not.toBe(nasty);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns problem+json for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    const body = res.json<{ code: string; status: number; title: string; instance: string }>();
    expect(body.code).toBe("orbita:not_found");
    expect(body.status).toBe(404);
    expect(body.instance).toBeDefined();
  });

  it("maps an OrbitaError thrown by a handler to problem+json", async () => {
    const res = await app.inject({ method: "GET", url: "/__boom" });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string; title: string }>();
    expect(body.code).toBe("orbita:not_found");
    expect(body.title).toBe("Employee not found");
  });

  it("maps an unexpected throw to orbita:internal without leaking details", async () => {
    const res = await app.inject({ method: "GET", url: "/__crash" });
    expect(res.statusCode).toBe(500);
    const body = res.json<{ code: string; detail?: string }>();
    expect(body.code).toBe("orbita:internal");
    expect(body.detail).toBeUndefined();
  });

  it("maps a ZodError to orbita:validation with field paths", async () => {
    const res = await app.inject({ method: "GET", url: "/__zod" });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ code: string; errors: { path: string }[] }>();
    expect(body.code).toBe("orbita:validation");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]?.path).toBe("x");
  });
});
