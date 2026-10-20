import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { OrbitaError, Errors, PROBLEM_CONTENT_TYPE, type FieldError, type Problem } from "../errors.js";

type ZodIssueLike = { path: readonly PropertyKey[]; message: string };

/**
 * One place turns anything thrown by a route into a problem+json response.
 *
 * Rules:
 * - `OrbitaError` is already shaped for the wire; copy fields verbatim.
 * - `ZodError` means a validated input failed — map issues to field errors and
 *   return `orbita:validation` (400). This covers both route schemas (via the
 *   Zod type provider) and ad-hoc `.safeParse` calls.
 * - Fastify's own validation errors (schema compiler) carry `.validation`.
 * - Everything else is a bug: log it with the request id, return
 *   `orbita:internal` (500), hide details in production.
 */
export const errorHandlerPlugin: FastifyPluginAsync = fp(
  (app) => {
    app.setNotFoundHandler((req, reply) => sendProblem(req, reply, Errors.notFound("Route")));

    app.setErrorHandler((err, req, reply) => {
      if (err instanceof OrbitaError) return sendProblem(req, reply, err);

      if (err instanceof ZodError) {
        return sendProblem(req, reply, Errors.validation(err.issues.map(zodIssueToField)));
      }

      const fastifyValidation = (err as { validation?: unknown }).validation;
      if (Array.isArray(fastifyValidation) && fastifyValidation.length > 0) {
        return sendProblem(req, reply, Errors.validation(fastifyValidation.map(fastifyIssueToField)));
      }

      if ((err as { statusCode?: number }).statusCode === 429) {
        return sendProblem(req, reply, Errors.tooManyRequests());
      }

      req.log.error({ err }, "unhandled error");
      return sendProblem(req, reply, Errors.internal());
    });
    return Promise.resolve();
  },
  { name: "error-handler" },
);

function sendProblem(req: FastifyRequest, reply: FastifyReply, err: OrbitaError): FastifyReply {
  const body: Problem = {
    type: "about:blank",
    title: err.title,
    status: err.status,
    code: err.code,
    instance: req.id,
    ...(err.message !== err.title ? { detail: err.message } : {}),
    ...(err.errors !== undefined ? { errors: err.errors } : {}),
  };
  return reply.code(err.status).type(PROBLEM_CONTENT_TYPE).send(body);
}

function zodIssueToField(issue: ZodIssueLike): FieldError {
  return {
    path: issue.path.map((p) => String(p)).join(".") || "(root)",
    message: issue.message,
  };
}

interface FastifyIssue {
  instancePath?: string;
  params?: { missingProperty?: string };
  message?: string;
}
function fastifyIssueToField(raw: unknown): FieldError {
  const i = raw as FastifyIssue;
  const base =
    typeof i.instancePath === "string" ? i.instancePath.replace(/^\//, "").replaceAll("/", ".") : "";
  const missing = i.params?.missingProperty;
  const path = missing !== undefined ? (base ? `${base}.${missing}` : missing) : base || "(root)";
  return { path, message: i.message ?? "Invalid value" };
}
