import cookie from "@fastify/cookie";
import fp from "fastify-plugin";

interface CookieOptions {
  secret: string;
}

/**
 * Thin wrapper around @fastify/cookie so the signing secret is loaded in one
 * place and we can swap the library later without touching every route. The
 * secret only signs cookies when a route opts in (`signed: true`); the
 * session cookie is random itself and does not need a signature.
 */
export const cookiePlugin = fp<CookieOptions>(
  async (app, opts) => {
    await app.register(cookie, { secret: opts.secret, parseOptions: {} });
  },
  { name: "cookie" },
);
