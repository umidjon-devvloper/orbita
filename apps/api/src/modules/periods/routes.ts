import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import { createPeriod, listPeriods, setPeriodStatus } from "./service.js";

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CreateBody = z.object({ startsOn: Iso, endsOn: Iso });
const StatusBody = z.object({ status: z.enum(["OPEN", "CLOSED", "FINALIZED"]) });
const IdParam = z.object({ id: z.uuid() });

/**
 * Performance periods — `config:manage` creates and moves state;
 * `report:read` or any scoped grant can list.
 */
export const periodRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: app.requirePermission("report:read") }, async (req) => ({
    periods: await listPeriods(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/",
    { schema: { body: CreateBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      period: await createPeriod(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.patch(
    "/:id/status",
    {
      schema: { body: StatusBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req) => ({
      period: await setPeriodStatus(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.status,
        auditFrom(req),
      ),
    }),
  );

  return Promise.resolve();
};
