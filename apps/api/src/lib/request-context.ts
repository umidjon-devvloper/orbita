import type { FastifyRequest } from "fastify";
import { Errors } from "../errors.js";

/**
 * Shared helpers used by every CRUD module. Pulling these into one place
 * keeps route handlers short and prevents drift (one route resolving the
 * org differently from the next is a subtle data-leak bug).
 */

export async function orgIdOf(req: FastifyRequest): Promise<string> {
  const actor = req.actor;
  if (actor === undefined) throw Errors.forbidden();
  const user = await req.server.prisma.user.findUnique({
    where: { id: actor.userId },
    select: { orgId: true },
  });
  if (user === null) throw Errors.forbidden();
  return user.orgId;
}

export interface AuditContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ip: string | null;
}

export function auditFrom(req: FastifyRequest): AuditContext {
  if (req.actor === undefined) throw Errors.forbidden();
  return {
    actorId: req.actor.userId,
    requestId: req.id,
    ip: req.ip.startsWith("::ffff:") ? req.ip.slice(7) : req.ip,
  };
}
