import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../../errors.js";
import { assignRole, createUser, listRoles, listUsers, revokeRole, setUserStatus } from "./service.js";

const CreateUserBody = z.object({
  email: z.email().max(254),
  locale: z.enum(["uz", "ru", "en"]).optional(),
});

const StatusBody = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

const AssignRoleBody = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
  orgUnitId: z.uuid().nullable(),
});

const IdParam = z.object({ id: z.uuid() });

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

export const userRoutes: FastifyPluginAsync = (parent) => {
  const app = parent.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: app.requirePermission("user:manage") }, async (req) => {
    const orgId = await orgIdOf(req);
    return { users: await listUsers(req.server.prisma, orgId) };
  });

  app.post(
    "/",
    { schema: { body: CreateUserBody }, preHandler: app.requirePermission("user:manage") },
    async (req) => {
      const orgId = await orgIdOf(req);
      const created = await createUser(
        req.server.prisma,
        {
          orgId,
          email: req.body.email,
          ...(req.body.locale !== undefined ? { locale: req.body.locale } : {}),
        },
        auditFrom(req),
      );
      return { user: created };
    },
  );

  app.patch(
    "/:id/status",
    {
      schema: { body: StatusBody, params: IdParam },
      preHandler: app.requirePermission("user:manage"),
    },
    async (req, reply) => {
      const orgId = await orgIdOf(req);
      await setUserStatus(req.server.prisma, orgId, req.params.id, req.body.status, auditFrom(req));
      return reply.code(204).send();
    },
  );

  app.get("/roles", { preHandler: app.requirePermission("role:manage") }, async (req) => {
    const orgId = await orgIdOf(req);
    return { roles: await listRoles(req.server.prisma, orgId) };
  });

  app.post(
    "/role-assignments",
    { schema: { body: AssignRoleBody }, preHandler: app.requirePermission("role:manage") },
    async (req) => {
      const orgId = await orgIdOf(req);
      const row = await assignRole(
        req.server.prisma,
        {
          orgId,
          userId: req.body.userId,
          roleId: req.body.roleId,
          orgUnitId: req.body.orgUnitId,
        },
        auditFrom(req),
      );
      return { assignment: row };
    },
  );

  app.delete(
    "/role-assignments/:id",
    { schema: { params: IdParam }, preHandler: app.requirePermission("role:manage") },
    async (req, reply) => {
      const orgId = await orgIdOf(req);
      await revokeRole(req.server.prisma, orgId, req.params.id, auditFrom(req));
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
