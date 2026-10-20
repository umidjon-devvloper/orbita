import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditFrom, orgIdOf } from "../../lib/request-context.js";
import { listEvidence, rejectEvidence, submitEvidence, verifyEvidence } from "./service.js";

const EvidenceType = z.enum([
  "SERVICE_RECORD",
  "SALE",
  "CUSTOMER_FEEDBACK",
  "TRAINING",
  "MENTORING",
  "PROCESS_IMPROVEMENT",
  "NEW_CUSTOMER",
  "WORK_SAMPLE",
  "OTHER",
]);

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Amount = z.union([z.string().regex(/^\d{1,18}$/), z.number().int().min(0)]);

const SubmitBody = z.object({
  employeeId: z.uuid(),
  periodId: z.uuid(),
  type: EvidenceType,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  occurredOn: Iso,
  serviceFee: Amount.optional(),
  governmentFee: Amount.optional(),
  quantity: z.number().int().min(0).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
});

const ListQuery = z.object({
  periodId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: z.enum(["SUBMITTED", "VERIFIED", "REJECTED"]).optional(),
});

const RejectBody = z.object({ reason: z.string().min(1).max(500) });
const IdParam = z.object({ id: z.uuid() });

export const evidenceRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    { schema: { querystring: ListQuery }, preHandler: app.requirePermission("evidence:verify") },
    async (req) => ({
      evidence: await listEvidence(req.server.prisma, await orgIdOf(req), req.query),
    }),
  );
  // Admins and managers submit evidence on behalf of employees (CSV, manual
  // entry); they already own `employee:manage` with the right scope. A
  // separate self-service `/me/evidence` endpoint for employees will use
  // the `evidence:submit` OWN permission in a later slice.
  app.post(
    "/",
    { schema: { body: SubmitBody }, preHandler: app.requirePermission("employee:manage") },
    async (req) => ({
      evidence: await submitEvidence(req.server.prisma, await orgIdOf(req), req.body, auditFrom(req)),
    }),
  );
  app.post(
    "/:id/verify",
    { schema: { params: IdParam }, preHandler: app.requirePermission("evidence:verify") },
    async (req) => ({
      evidence: await verifyEvidence(req.server.prisma, await orgIdOf(req), req.params.id, auditFrom(req)),
    }),
  );
  app.post(
    "/:id/reject",
    {
      schema: { body: RejectBody, params: IdParam },
      preHandler: app.requirePermission("evidence:verify"),
    },
    async (req) => ({
      evidence: await rejectEvidence(
        req.server.prisma,
        await orgIdOf(req),
        req.params.id,
        req.body.reason,
        auditFrom(req),
      ),
    }),
  );

  return Promise.resolve();
};
