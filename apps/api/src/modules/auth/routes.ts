import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../../errors.js";
import { SESSION } from "../../lib/session.js";
import { sha256Hex } from "../../lib/tokens.js";
import { confirmPasswordReset, login, logout, requestPasswordReset, type AuthContext } from "./service.js";

const LoginBody = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(1024),
});

const RequestResetBody = z.object({
  email: z.string().min(3).max(254),
});

const ConfirmResetBody = z.object({
  token: z.string().min(16).max(1024),
  newPassword: z.string().min(10).max(1024),
});

export interface AuthRoutesDeps {
  readonly ctx: AuthContext;
  /** `secure` cookie flag — on in production, off for `http://localhost` dev. */
  readonly secureCookie: boolean;
}

/**
 * Mounts the auth endpoints under the caller's prefix:
 *
 *   POST /login                     — sign in, sets session cookie, returns csrf
 *   POST /logout                    — delete session, clear cookie
 *   GET  /me                        — current user from the session cookie
 *   POST /password-reset/request    — email a reset link; identical reply either way
 *   POST /password-reset/confirm    — redeem a reset token; revokes other sessions
 */
export const authRoutes = (deps: AuthRoutesDeps): FastifyPluginAsync => {
  const { ctx, secureCookie } = deps;

  return (parent) => {
    const app = parent.withTypeProvider<ZodTypeProvider>();

    app.post("/login", { schema: { body: LoginBody } }, async (req, reply) => {
      const result = await login(ctx, {
        email: req.body.email,
        password: req.body.password,
        ip: ipOf(req.ip),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      setSessionCookie(reply, result.cookieToken, secureCookie);
      return {
        user: result.user,
        csrfToken: result.csrfToken,
      };
    });

    app.post("/logout", async (req, reply) => {
      const raw = req.cookies[SESSION.COOKIE_NAME];
      if (typeof raw === "string" && raw.length > 0) {
        await logout(ctx, raw);
      }
      clearSessionCookie(reply, secureCookie);
      return reply.code(204).send();
    });

    app.get("/me", async (req) => {
      const user = await resolveUser(ctx, req.cookies[SESSION.COOKIE_NAME]);
      if (user === null) throw Errors.unauthenticated();
      return { user };
    });

    app.post("/password-reset/request", { schema: { body: RequestResetBody } }, async (req) => {
      await requestPasswordReset(ctx, {
        email: req.body.email,
        ip: ipOf(req.ip),
      });
      return { ok: true as const };
    });

    app.post("/password-reset/confirm", { schema: { body: ConfirmResetBody } }, async (req) => {
      await confirmPasswordReset(ctx, {
        token: req.body.token,
        newPassword: req.body.newPassword,
      });
      return { ok: true as const };
    });

    return Promise.resolve();
  };
};

async function resolveUser(ctx: AuthContext, rawToken: string | undefined) {
  if (typeof rawToken !== "string" || rawToken.length === 0) return null;
  const session = await ctx.prisma.session.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    include: { user: true },
  });
  if (session === null) return null;
  const now = ctx.now();
  if (session.idleExpires.getTime() <= now.getTime() || session.absExpires.getTime() <= now.getTime()) {
    await ctx.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    orgId: session.user.orgId,
    locale: session.user.locale,
    theme: session.user.theme,
  };
}

function setSessionCookie(reply: FastifyReply, value: string, secure: boolean): void {
  reply.setCookie(SESSION.COOKIE_NAME, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION.ABSOLUTE_MS / 1000),
  });
}

function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION.COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

function ipOf(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  // Trim an IPv4-mapped-IPv6 prefix so the rate-limit key is comparable
  // across proxy configurations.
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}
