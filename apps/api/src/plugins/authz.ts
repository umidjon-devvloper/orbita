import { can, type Actor, type Permission, type ResourceRef } from "@orbita/domain";
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import fp from "fastify-plugin";
import { Errors } from "../errors.js";
import { SESSION } from "../lib/session.js";
import { sha256Hex } from "../lib/tokens.js";
import { loadActor } from "../modules/authz/actor.js";

/**
 * Server-side authorization — the one truthful check. The UI hides
 * controls as a convenience; this plugin decides what the API actually
 * accepts, so a caller who hits an endpoint directly must still fail.
 *
 * `createRequirePermission({ now })` is a factory: pass an overridable
 * clock (handy for tests), get back a `requirePermission(permission,
 * resource?)` that produces a Fastify preHandler. Each preHandler:
 *   1. Reads the session cookie, hashes it, looks up the DB session.
 *   2. Deletes expired rows and treats a missing/expired session as 401.
 *   3. Loads the actor's grants once; caches them on `req.actor` so a
 *      follow-up preHandler on the same route doesn't re-query.
 *   4. Resolves the target resource (if a resolver is given) and runs
 *      `can(actor, permission, resource)`. 403 on failure.
 */

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requirePermission after a successful check. */
    actor?: Actor;
  }
}

export interface AuthzDeps {
  readonly now?: () => Date;
}

export type ResourceResolver = (req: FastifyRequest) => Promise<ResourceRef> | ResourceRef;

export interface RequirePermission {
  (permission: Permission, resource?: ResourceResolver): preHandlerAsyncHookHandler;
}

export function createRequirePermission(deps: AuthzDeps = {}): RequirePermission {
  const now = deps.now ?? (() => new Date());
  return function requirePermission(permission, resource) {
    return async function preHandler(req): Promise<void> {
      const actor = await resolveActor(req, now);
      if (actor === null) throw Errors.unauthenticated();
      const ref: ResourceRef = resource !== undefined ? await resource(req) : {};
      if (!can(actor, permission, ref)) throw Errors.forbidden();
      req.actor = actor;
    };
  };
}

async function resolveActor(req: FastifyRequest, now: () => Date): Promise<Actor | null> {
  if (req.actor !== undefined) return req.actor;
  const raw = req.cookies[SESSION.COOKIE_NAME];
  if (typeof raw !== "string" || raw.length === 0) return null;
  const session = await req.server.prisma.session.findUnique({
    where: { tokenHash: sha256Hex(raw) },
  });
  if (session === null) return null;
  const n = now();
  if (session.idleExpires.getTime() <= n.getTime() || session.absExpires.getTime() <= n.getTime()) {
    await req.server.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return loadActor(req.server.prisma, session.userId);
}

/**
 * App-level plugin that exposes the factory on `app.requirePermission`. Call
 * sites import this (via `app.requirePermission(...)`) in route definitions.
 */
declare module "fastify" {
  interface FastifyInstance {
    requirePermission: RequirePermission;
  }
}

export const authzPlugin: FastifyPluginAsync<AuthzDeps> = fp(
  (app, deps) => {
    app.decorate("requirePermission", createRequirePermission(deps));
    return Promise.resolve();
  },
  { name: "authz" },
);
