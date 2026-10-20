import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { LocalizedTextSchema } from "../../lib/localized.js";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import {
  activateVersion,
  cloneVersion,
  createRubric,
  getVersion,
  listRubrics,
  removeCriterion,
  upsertCriterion,
} from "./service.js";

// Metric config is validated by the domain's `validateRubric()` at activation
// time (which checks every rule — reads, double-counting, kinds, scales).
// The API layer passes it through as JSON; a bad config stops activation,
// not storage of a DRAFT.
const MetricConfigSchema = z.record(z.string(), z.unknown());

const CreateRubricBody = z.object({
  specialtyId: z.uuid(),
  purpose: z.enum(["CANDIDATE", "PERFORMANCE", "LEVEL_REVIEW"]),
  name: LocalizedTextSchema,
});

const CriterionBody = z.object({
  key: z.string(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
  competencyId: z.uuid().nullable().optional(),
  weightBp: z.number().int().min(0).max(10000),
  method: z.enum(["AUTO_QUIZ", "MANUAL", "EVIDENCE_METRIC"]),
  metricConfig: MetricConfigSchema.nullable().optional(),
  isGate: z.boolean().optional(),
  gateMinScore: z.number().int().min(0).max(10000).nullable().optional(),
  evidenceRequired: z.boolean().optional(),
  minEvidenceCount: z.number().int().min(0).optional(),
  allowNotApplicable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const CloneBody = z.object({ changeNote: z.string().max(1000).nullable().optional() });
const IdParam = z.object({ id: z.uuid() });
const VersionCriterionParams = z.object({ id: z.uuid(), criterionId: z.uuid() });

export const rubricRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: app.requirePermission("config:manage") }, async (req) => ({
    rubrics: await listRubrics(req.server.prisma, await orgIdOf(req)),
  }));

  app.post(
    "/",
    { schema: { body: CreateRubricBody }, preHandler: app.requirePermission("config:manage") },
    async (req) => {
      const out = await createRubric(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req));
      return { rubric: out.rubric, versionId: out.versionId };
    },
  );

  app.get(
    "/versions/:id",
    { schema: { params: IdParam }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({ version: await getVersion(req.server.prisma, await orgIdOf(req), req.params.id) }),
  );

  app.post(
    "/versions/:id/clone",
    {
      schema: { body: CloneBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req) => ({
      version: await cloneVersion(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.changeNote ?? null,
        auditFrom(req),
      ),
    }),
  );

  app.put(
    "/versions/:id/criteria",
    {
      schema: { body: CriterionBody, params: IdParam },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req) => ({
      criterion: await upsertCriterion(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body,
        auditFrom(req),
      ),
    }),
  );

  app.delete(
    "/versions/:id/criteria/:criterionId",
    {
      schema: { params: VersionCriterionParams },
      preHandler: app.requirePermission("config:manage"),
    },
    async (req, reply) => {
      await removeCriterion(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.params.criterionId,
        auditFrom(req),
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/versions/:id/activate",
    { schema: { params: IdParam }, preHandler: app.requirePermission("config:manage") },
    async (req) => ({
      version: await activateVersion(req.server.prisma, await orgIdOf(req), req.params.id, auditFrom(req)),
    }),
  );

  return Promise.resolve();
};
