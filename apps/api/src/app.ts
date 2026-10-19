import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { genReqId, requestIdPlugin } from "./plugins/request-id.js";
import { healthRoutes } from "./routes/health.js";
import type { PrismaClient } from "./db/client.js";

export type OrbitaApp = Awaited<ReturnType<typeof buildApp>>;

export interface BuildAppOptions {
  config: Config;
  logger: Logger;
  /** Pre-built client for tests. Production passes a URL and lets the plugin own the lifecycle. */
  prisma?: PrismaClient;
}

/**
 * Build a configured Fastify instance. Pure factory — does not listen. Call
 * sites: `server.ts` for production, integration tests for `app.inject`.
 *
 * Plugin order matters:
 *   1. error-handler sets handlers early so later plugin errors are shaped;
 *   2. request-id attaches request ids used by the error handler for `instance`;
 *   3. prisma decorates the app for routes that need the DB;
 *   4. routes are registered under `/api/v1`.
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
  await app.register(prismaPlugin, {
    ...(opts.prisma !== undefined ? { client: opts.prisma } : { url: opts.config.DATABASE_URL }),
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
