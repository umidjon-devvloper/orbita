import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { LocalizedTextSchema } from "../../lib/localized.js";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import {
  createCompetency,
  createPosition,
  createSpecialty,
  listCompetencies,
  listPositions,
  listSpecialties,
  removePositionCompetency,
  setPositionCompetency,
  updateSpecialty,
} from "./service.js";

const SpecialtyCreateBody = z.object({
  key: z.string(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
});

const PartialLocalized = z
  .object({
    uz: z.string().min(1).max(400).optional(),
    ru: z.string().min(1).max(400).optional(),
    en: z.string().min(1).max(400).optional(),
  })
  .refine((v) => v.uz !== undefined || v.ru !== undefined || v.en !== undefined, {
    message: "At least one locale is required",
  });

const SpecialtyPatchBody = z.object({
  name: PartialLocalized.optional(),
  description: PartialLocalized.optional(),
  isActive: z.boolean().optional(),
});

const PositionCreateBody = z.object({
  specialtyId: z.uuid(),
  key: z.string(),
  title: LocalizedTextSchema,
});

const PositionCompetencyBody = z.object({
  competencyId: z.uuid(),
  importance: z.number().int().min(1).max(3),
});

const CompetencyCreateBody = z.object({
  key: z.string(),
  name: LocalizedTextSchema,
});

const IdParam = z.object({ id: z.uuid() });
const PositionCompetencyParams = z.object({ id: z.uuid(), competencyId: z.uuid() });

export const catalogRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  // --- Specialties ---
  app.get("/specialties", { preHandler: app.requirePermission("config:manage") }, async (req) => ({
    specialties: await listSpecialties(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/specialties",
    { schema: { body: SpecialtyCreateBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      specialty: await createSpecialty(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.patch(
    "/specialties/:id",
    {
      schema: { body: SpecialtyPatchBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req) => ({
      specialty: await updateSpecialty(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body,
        auditFrom(req),
      ),
    }),
  );

  // --- Positions ---
  app.get("/positions", { preHandler: app.requirePermission("config:manage") }, async (req) => ({
    positions: await listPositions(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/positions",
    { schema: { body: PositionCreateBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      position: await createPosition(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.put(
    "/positions/:id/competencies/:competencyId",
    {
      schema: {
        body: z.object({ importance: z.number().int().min(1).max(3) }),
        params: PositionCompetencyParams,
      },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await setPositionCompetency(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.params.competencyId,
        req.body.importance,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );
  app.post(
    "/positions/:id/competencies",
    {
      schema: { body: PositionCompetencyBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await setPositionCompetency(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.competencyId,
        req.body.importance,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );
  app.delete(
    "/positions/:id/competencies/:competencyId",
    {
      schema: { params: PositionCompetencyParams },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await removePositionCompetency(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.params.competencyId,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );

  // --- Competencies ---
  app.get("/competencies", { preHandler: app.requirePermission("config:manage") }, async (req) => ({
    competencies: await listCompetencies(req.server.prisma, await orgIdOf(req)),
  }));
  app.post(
    "/competencies",
    { schema: { body: CompetencyCreateBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      competency: await createCompetency(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );

  return Promise.resolve();
};
