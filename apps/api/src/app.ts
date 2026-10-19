import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { PrismaClient } from "./db/client.js";
import type { Mailer } from "./lib/mailer.js";
import { createRateLimit, type RateLimit } from "./lib/rate-limit.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import type { AuthContext } from "./modules/auth/service.js";
import { authzPlugin } from "./plugins/authz.js";
import { cookiePlugin } from "./plugins/cookie.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { genReqId, requestIdPlugin } from "./plugins/request-id.js";
import { healthRoutes } from "./routes/health.js";

export type OrbitaApp = Awaited<ReturnType<typeof buildApp>>;

export interface BuildAppOptions {
  config: Config;
  logger: Logger;
  /** Pre-built client for tests. Production passes a URL and lets the plugin own the lifecycle. */
  prisma?: PrismaClient;
  mailer: Mailer;
  /** Overridable clock for tests. */
  now?: () => Date;
  /** Pre-built rate limiters for tests (so they can be inspected and cleared). */
  loginLimit?: RateLimit;
  resetLimit?: RateLimit;
}

/**
 * Build a configured Fastify instance. Pure factory — does not listen. Call
 * sites: `server.ts` for production, integration tests for `app.inject`.
 *
 * Plugin order matters:
 *   1. error-handler sets handlers early so later plugin errors are shaped;
 *   2. request-id attaches request ids used by the error handler for `instance`;
 *   3. cookie parses signed cookies before any route that reads them;
 *   4. prisma decorates the app for routes that need the DB;
 *   5. routes are registered under `/api/v1`.
 */
export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({
    loggerInstance: opts.logger,
    genReqId,
    disableRequestLogging: opts.config.NODE_ENV === "test",
    requestIdLogLabel: "reqId",
    bodyLimit: 1_000_000,
    trustProxy: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandlerPlugin);
  await app.register(requestIdPlugin);
  await app.register(cookiePlugin, { secret: opts.config.SESSION_SECRET });
  await app.register(prismaPlugin, {
    ...(opts.prisma !== undefined ? { client: opts.prisma } : { url: opts.config.DATABASE_URL }),
  });
  await app.register(authzPlugin, { ...(opts.now !== undefined ? { now: opts.now } : {}) });

  // Login: five tries per IP+email per minute. Reset: three per email per hour.
  const loginLimit = opts.loginLimit ?? createRateLimit({ max: 5, windowMs: 60_000 });
  const resetLimit = opts.resetLimit ?? createRateLimit({ max: 3, windowMs: 60 * 60_000 });
  const authCtx: AuthContext = {
    prisma: app.prisma,
    mailer: opts.mailer,
    loginLimit,
    resetLimit,
    now: opts.now ?? (() => new Date()),
    brandName: opts.config.BRAND_NAME,
    appUrl: opts.config.APP_URL,
  };
  const secureCookie = opts.config.NODE_ENV === "production";

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes({ ctx: authCtx, secureCookie }), { prefix: "/auth" });
      await v1.register(auditRoutes, { prefix: "/audit" });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
