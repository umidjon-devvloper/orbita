import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../../errors.js";

const Query = z.object({
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Audit log reader. Scoped to the actor's organization — a staff member
 * with `audit:read` sees only their own org's events, never another
 * tenant's. Ordered newest first; `limit` caps the page so a broad
 * query cannot drag the DB down.
 */
export const auditRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();
  app.get(
    "/",
    { schema: { querystring: Query }, preHandler: app.requirePermission("audit:read") },
    async (req) => {
      const actor = req.actor;
      if (actor === undefined) throw Errors.forbidden();
      // The actor is attached to a user; find that user's org for the scope.
      const user = await req.server.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { orgId: true },
      });
      if (user === null) throw Errors.forbidden();
      const events = await req.server.prisma.auditEvent.findMany({
        where: {
          orgId: user.orgId,
          ...(req.query.entityType !== undefined ? { entityType: req.query.entityType } : {}),
          ...(req.query.entityId !== undefined ? { entityId: req.query.entityId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: req.query.limit,
      });
      return {
        events: events.map((e) => ({
          id: e.id,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          actorId: e.actorId,
          createdAt: e.createdAt.toISOString(),
          requestId: e.requestId,
          before: e.before,
          after: e.after,
        })),
      };
    },
  );
  return Promise.resolve();
};
