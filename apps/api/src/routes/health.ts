import type { FastifyPluginAsync } from "fastify";

/**
 * Health endpoints.
 *
 * - `/healthz`: liveness — the process answers HTTP. No DB round-trip, so a
 *   stuck DB does not take the pod out of rotation while the app is still
 *   able to serve static or cached responses.
 * - `/readyz`: readiness — probes the DB with `SELECT 1`. Returns 503 if the
 *   database is not reachable, so load balancers do not route traffic to a
 *   pod that cannot serve requests.
 */
export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get("/healthz", () => ({ status: "ok" as const }));

  app.get("/readyz", async (_req, reply) => {
    try {
      await app.prisma.$queryRawUnsafe("SELECT 1");
      return { status: "ok" as const, db: "ok" as const };
    } catch {
      return reply.code(503).send({ status: "unavailable", db: "unavailable" });
    }
  });
  return Promise.resolve();
};
