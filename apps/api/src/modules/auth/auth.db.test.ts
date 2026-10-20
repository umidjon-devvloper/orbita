import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type OrbitaApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { createPrisma, type PrismaClient } from "../../db/client.js";
import { TEST_URL } from "../../db/test-db.js";
import { createConsoleMailer, type ConsoleMailer } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { createRateLimit, type RateLimit } from "../../lib/rate-limit.js";
import { SESSION } from "../../lib/session.js";
import { createLogger } from "../../logger.js";

let app: OrbitaApp;
let prisma: PrismaClient;
let mailer: ConsoleMailer;
let loginLimit: RateLimit;
let resetLimit: RateLimit;

const now = () => new Date();

/** Minimal fixture: one Organization + one User with a known password. */
async function seedUser(email: string, password: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  const org = await prisma.organization.create({ data: { name: `Org ${email}` } });
  return prisma.user.create({
    data: {
      orgId: org.id,
      email,
      passwordHash: await hashPassword(password),
      status,
    },
  });
}

/**
 * Per-test cleanup is deliberately narrow: AuditEvent rows are append-only
 * (DB trigger, D-35), so wholesale wipes fail. Each test uses a unique
 * email + its own Organization row, so leaving users and orgs in place
 * between tests is safe. We only clear sessions, reset tokens and the
 * in-memory mailer outbox.
 */
async function wipeUsers() {
  await prisma.session.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
}

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_URL,
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  });
  const logger = createLogger(config);
  prisma = createPrisma(TEST_URL);
  mailer = createConsoleMailer();
  loginLimit = createRateLimit({ max: 5, windowMs: 60_000 });
  resetLimit = createRateLimit({ max: 3, windowMs: 60 * 60_000 });
  app = await buildApp({ config, logger, prisma, mailer, now, loginLimit, resetLimit });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeUsers();
  mailer.clear();
});

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const set: unknown = res.headers["set-cookie"];
  const first: unknown = Array.isArray(set) ? (set.length > 0 ? set[0] : "") : set;
  return typeof first === "string" ? (first.split(";")[0] ?? "") : "";
}

describe("POST /auth/login", () => {
  it("returns the user and a csrf token, sets an HttpOnly cookie", async () => {
    await seedUser("alice@example.uz", "s3cret-pass-1234");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "alice@example.uz", password: "s3cret-pass-1234" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { email: string }; csrfToken: string }>();
    expect(body.user.email).toBe("alice@example.uz");
    expect(body.csrfToken).toHaveLength(43);
    const set = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(set) ? set[0] : set;
    expect(cookieHeader).toContain(`${SESSION.COOKIE_NAME}=`);
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Lax/i);
  });

  it("rejects a wrong password with 401 and no cookie", async () => {
    await seedUser("bob@example.uz", "s3cret-pass-1234");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "bob@example.uz", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe("orbita:auth:invalid_credentials");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("returns the same error code for an unknown email as for a wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ghost@example.uz", password: "anything-at-all" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe("orbita:auth:invalid_credentials");
  });

  it("refuses a DISABLED account the same way", async () => {
    await seedUser("dis@example.uz", "s3cret-pass-1234", "DISABLED");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "dis@example.uz", password: "s3cret-pass-1234" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("locks the account after five consecutive failed attempts", async () => {
    await seedUser("lock@example.uz", "s3cret-pass-1234");
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "lock@example.uz", password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
    }
    // Rate-limit budget is spent for this IP+email; clear it to prove the
    // lock itself (not the per-minute limit) stops the next login.
    loginLimit.reset("127.0.0.1|lock@example.uz");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "lock@example.uz", password: "s3cret-pass-1234" },
    });
    expect(res.statusCode).toBe(423);
    expect(res.json<{ code: string }>().code).toBe("orbita:auth:locked");
    const stored = await prisma.user.findFirst({ where: { email: "lock@example.uz" } });
    expect(stored?.lockedUntil).not.toBeNull();
  });

  it("enforces the per-IP+email rate limit", async () => {
    const rl = createRateLimit({ max: 2, windowMs: 60_000 });
    // Install a tighter limit just for this test by replacing the shared one.
    for (let i = 0; i < 2; i += 1) rl.hit("127.0.0.1|rate@example.uz");
    loginLimit.hit("127.0.0.1|rate@example.uz");
    loginLimit.hit("127.0.0.1|rate@example.uz");
    loginLimit.hit("127.0.0.1|rate@example.uz");
    loginLimit.hit("127.0.0.1|rate@example.uz");
    loginLimit.hit("127.0.0.1|rate@example.uz");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "rate@example.uz", password: "whatever" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json<{ code: string }>().code).toBe("orbita:auth:rate_limited");
    loginLimit.reset("127.0.0.1|rate@example.uz");
  });

  it("rejects malformed input with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:validation");
  });
});

describe("GET /auth/me and session lifecycle", () => {
  it("returns 401 without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the user when the cookie is valid", async () => {
    await seedUser("carol@example.uz", "s3cret-pass-1234");
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "carol@example.uz", password: "s3cret-pass-1234" },
    });
    const cookie = cookieFrom(login);
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { email: string } }>().user.email).toBe("carol@example.uz");
  });

  it("rejects an expired session cookie and deletes the row", async () => {
    const user = await seedUser("exp@example.uz", "s3cret-pass-1234");
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "exp@example.uz", password: "s3cret-pass-1234" },
    });
    const cookie = cookieFrom(login);
    // Fast-forward both expiries into the past by updating the row directly.
    const past = new Date(Date.now() - 60_000);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { idleExpires: past, absExpires: past },
    });
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("POST /auth/logout clears the cookie and deletes the session", async () => {
    const user = await seedUser("out@example.uz", "s3cret-pass-1234");
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "out@example.uz", password: "s3cret-pass-1234" },
    });
    const cookie = cookieFrom(login);
    const logout = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

describe("password reset", () => {
  it("sends a reset email with a redeemable link; identical response when the email is unknown", async () => {
    await seedUser("reset@example.uz", "old-password-12");
    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset@example.uz" },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json<{ ok: true }>().ok).toBe(true);

    const r2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "ghost@example.uz" },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json<{ ok: true }>().ok).toBe(true);

    const sent = mailer.byRecipient("reset@example.uz");
    expect(sent).toBeDefined();
    expect(mailer.byRecipient("ghost@example.uz")).toBeUndefined();

    const match = /token=([^&\s]+)/.exec(sent!.text);
    expect(match).not.toBeNull();
    const token = decodeURIComponent(match![1]!);

    const confirm = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, newPassword: "brand-new-password-x" },
    });
    expect(confirm.statusCode).toBe(200);

    // Old password no longer works, new one does.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "reset@example.uz", password: "old-password-12" },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "reset@example.uz", password: "brand-new-password-x" },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("a reset token is single-use", async () => {
    await seedUser("single@example.uz", "old-password-12");
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "single@example.uz" },
    });
    const sent = mailer.byRecipient("single@example.uz");
    const token = decodeURIComponent(/token=([^&\s]+)/.exec(sent!.text)![1]!);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, newPassword: "first-new-password-x" },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, newPassword: "second-new-password-y" },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json<{ code: string }>().code).toBe("orbita:auth:invalid_reset_token");
  });

  it("confirming reset revokes every existing session for that user", async () => {
    const user = await seedUser("revoke@example.uz", "old-password-12");
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "revoke@example.uz", password: "old-password-12" },
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "revoke@example.uz" },
    });
    const token = decodeURIComponent(
      /token=([^&\s]+)/.exec(mailer.byRecipient("revoke@example.uz")!.text)![1]!,
    );
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, newPassword: "replacement-password-z" },
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("an expired reset token is rejected", async () => {
    const user = await seedUser("stale@example.uz", "old-password-12");
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "stale@example.uz" },
    });
    const past = new Date(Date.now() - 60_000);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: past },
    });
    const token = decodeURIComponent(
      /token=([^&\s]+)/.exec(mailer.byRecipient("stale@example.uz")!.text)![1]!,
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, newPassword: "whatever-is-long-enough" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe("orbita:auth:invalid_reset_token");
  });
});
