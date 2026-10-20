import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import { approveSalaryBand, closeSalaryBand, createSalaryBand, listSalaryBands } from "./service.js";

const Amount = z.union([z.string().regex(/^\d{1,18}$/), z.number().int().min(0)]);
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateBody = z.object({
  positionId: z.uuid(),
  levelId: z.uuid(),
  minAmount: Amount,
  maxAmount: Amount,
  effectiveFrom: Iso,
  effectiveTo: Iso.nullable().optional(),
});

const CloseBody = z.object({ effectiveTo: Iso });
const IdParam = z.object({ id: z.uuid() });

export const salaryBandRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: app.requirePermission("compensation:manage") }, async (req) => ({
    bands: await listSalaryBands(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/",
    { schema: { body: CreateBody }, preHandler: app.requirePermission("compensation:manage") },
    async (req) => ({
      band: await createSalaryBand(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.post(
    "/:id/close",
    {
      schema: { body: CloseBody, params: IdParam },
      preHandler: app.requirePermission("compensation:manage"),
    },
    async (req) => ({
      band: await closeSalaryBand(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.effectiveTo,
        auditFrom(req),
      ),
    }),
  );
  app.post(
    "/:id/approve",
    { schema: { params: IdParam }, preHandler: app.requirePermission("compensation:manage") },
    async (req, reply) => {
      await approveSalaryBand(req.server.prisma, await orgIdOf(req), req.params.id, auditFrom(req));
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
