import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const HEADER = "x-request-id";

/**
 * Adopt an inbound `X-Request-Id` when it looks safe (printable ASCII, ≤ 128
 * chars) and otherwise mint a UUID v4. The id is attached to the request
 * logger (via Fastify's genReqId) and echoed as a response header so the
 * client can quote it in bug reports.
 */
export const requestIdPlugin: FastifyPluginAsync = fp(
  (app) => {
    app.addHook("onSend", (req, reply, _payload, done) => {
      reply.header(HEADER, req.id);
      done();
    });
    return Promise.resolve();
  },
  { name: "request-id" },
);

export function genReqId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers[HEADER];
  const inbound = Array.isArray(raw) ? raw[0] : raw;
  if (typeof inbound === "string" && /^[\x20-\x7E]{1,128}$/.test(inbound)) return inbound;
  return randomUUID();
}
