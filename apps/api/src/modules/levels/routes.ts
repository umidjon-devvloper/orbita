import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { LocalizedTextSchema } from "../../lib/localized.js";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import {
  approveLevel,
  createLevel,
  listLevels,
  removeRequirement,
  reorderLevels,
  setLevelActive,
  upsertRequirement,
} from "./service.js";

const CreateBody = z.object({
  key: z.string(),
  name: LocalizedTextSchema,
  minTotalScore: z.number().int().min(0).max(10000).nullable().optional(),
  minMonthsAtPrevious: z.number().int().min(0).nullable().optional(),
  minApprovedAssessments: z.number().int().min(0).optional(),
});

const ReorderBody = z.object({ orderedIds: z.array(z.uuid()).min(1) });
const ActiveBody = z.object({ isActive: z.boolean() });
const RequirementBody = z.object({
  specialtyId: z.uuid(),
  competencyId: z.uuid(),
  minScore: z.number().int().min(0).max(10000),
  isGate: z.boolean(),
});

const IdParam = z.object({ id: z.uuid() });
const ReqParams = z.object({ id: z.uuid(), specialtyId: z.uuid(), competencyId: z.uuid() });

export const levelRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: app.requirePermission("config:manage") }, async (req) => ({
    levels: await listLevels(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/",
    { schema: { body: CreateBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      level: await createLevel(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.post(
    "/reorder",
    { schema: { body: ReorderBody }, preHandler: app.requirePermission("config:manage") },
    async (req, reply) => {
      await reorderLevels(req.server.prisma, await orgIdOf(req), req.body.orderedIds, auditFrom(req));
      return reply.code(204).send();
    },
  );
  app.patch(
    "/:id/active",
    {
      schema: { body: ActiveBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await setLevelActive(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.isActive,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );
  app.post(
    "/:id/approve",
    { schema: { params: IdParam }, preHandler: app.requirePermission("config:manage") },
    async (req, reply) => {
      await approveLevel(req.server.prisma, await orgIdOf(req), req.params.id, auditFrom(req));
      return reply.code(204).send();
    },
  );
  app.put(
    "/:id/requirements",
    {
      schema: { body: RequirementBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await upsertRequirement(req.server.prisma, await orgIdOf(req), req.params.id, req.body, auditFrom(req));
      return reply.code(204).send();
    },
  );
  app.delete(
    "/:id/requirements/:specialtyId/:competencyId",
    { schema: { params: ReqParams }, preHandler: app.requirePermission("config:manage") },
    async (req, reply) => {
      await removeRequirement(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.params.specialtyId,
        req.params.competencyId,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
