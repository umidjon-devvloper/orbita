import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../../errors.js";
import { createOrgUnit, deleteOrgUnit, listOrgUnits, updateOrgUnit } from "./service.js";

const CreateBody = z.object({
  parentId: z.uuid().nullable(),
  name: z.string().min(1).max(120),
});

const UpdateBody = z
  .object({
    parentId: z.uuid().nullable().optional(),
    name: z.string().min(1).max(120).optional(),
  })
  .refine((v) => v.parentId !== undefined || v.name !== undefined, {
    message: "At least one of name or parentId is required",
  });

const IdParam = z.object({ id: z.uuid() });

/**
 * Resolve the actor's org id (every actor has one — audited at login).
 * Lifted into a helper so each route stays short and so this read lives
 * next to the services that need it.
 */
async function orgIdOf(req: FastifyRequest): Promise<string> {
  const actor = req.actor;
  if (actor === undefined) throw Errors.forbidden();
  const user = await req.server.prisma.user.findUnique({
    where: { id: actor.userId },
    select: { orgId: true },
  });
  if (user === null) throw Errors.forbidden();
  return user.orgId;
}

function auditFrom(req: FastifyRequest) {
  if (req.actor === undefined) throw Errors.forbidden();
  return {
    actorId: req.actor.userId,
    requestId: req.id,
    ip: req.ip.startsWith("::ffff:") ? req.ip.slice(7) : req.ip,
  };
}

export const orgUnitRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  // List: `org:manage` can see every unit; a scoped manager sees only
  // their subtree. We pass the first ORG_UNIT grant path as the filter;
  // if none is present (an ORG-scope `org:manage`), filter is null.
  app.get("/", { preHandler: app.requirePermission("org:manage") }, async (req) => {
    const orgId = await orgIdOf(req);
    const grant = req.actor?.grants.find((g) => g.permission === "org:manage" && g.scope === "ORG_UNIT");
    const scopePath = grant?.orgUnitPath ?? null;
    const units = await listOrgUnits(req.server.prisma, orgId, scopePath);
    return { units };
  });

  // Create a unit under an optional parent. The permission check only
  // guards the mutation itself; the service verifies the parent belongs
  // to the actor's org before writing.
  app.post(
    "/",
    { schema: { body: CreateBody }, preHandler: app.requirePermission("org:manage") },
    async (req) => {
      const orgId = await orgIdOf(req);
      const unit = await createOrgUnit(
        req.server.prisma,
        { orgId, parentId: req.body.parentId, name: req.body.name },
        auditFrom(req),
      );
      return { unit };
    },
  );

  app.patch(
    "/:id",
    {
      schema: { body: UpdateBody, params: IdParam },
      preHandler: app.requirePermission("org:manage"),
    },
    async (req) => {
      const orgId = await orgIdOf(req);
      const unit = await updateOrgUnit(
        req.server.prisma,
        {
          id: req.params.id,
          orgId,
          ...(req.body.name !== undefined ? { name: req.body.name } : {}),
          ...(req.body.parentId !== undefined ? { parentId: req.body.parentId } : {}),
        },
        auditFrom(req),
      );
      return { unit };
    },
  );

  app.delete(
    "/:id",
    { schema: { params: IdParam }, preHandler: app.requirePermission("org:manage") },
    async (req, reply) => {
      const orgId = await orgIdOf(req);
      await deleteOrgUnit(req.server.prisma, orgId, req.params.id, auditFrom(req));
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
