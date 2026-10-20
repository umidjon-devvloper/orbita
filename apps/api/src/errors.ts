/**
 * Problem+json (RFC 9457) error shape used by every API route.
 *
 * `code` is a stable machine key of the form `orbita:<category>:<name>`. UI maps
 * it to a localized message; it is also an i18n key. HTTP `status` is a hint;
 * reserve the body for details so clients do not parse messages.
 */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors?: readonly FieldError[];
}

/**
 * Thrown by route handlers and services to produce a problem+json response.
 * Carries only data safe to send to the client — no stack, no DB internals.
 */
export class OrbitaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly title: string;
  readonly errors: readonly FieldError[] | undefined;

  constructor(input: {
    code: string;
    status: number;
    title: string;
    detail?: string;
    errors?: readonly FieldError[];
  }) {
    super(input.detail ?? input.title);
    this.name = "OrbitaError";
    this.code = input.code;
    this.status = input.status;
    this.title = input.title;
    this.errors = input.errors;
  }
}

export const Errors = {
  validation: (errors: readonly FieldError[]): OrbitaError =>
    new OrbitaError({
      code: "orbita:validation",
      status: 400,
      title: "Validation failed",
      errors,
    }),
  unauthenticated: (): OrbitaError =>
    new OrbitaError({ code: "orbita:unauthenticated", status: 401, title: "Not signed in" }),
  forbidden: (): OrbitaError =>
    new OrbitaError({ code: "orbita:forbidden", status: 403, title: "Forbidden" }),
  notFound: (what = "Resource"): OrbitaError =>
    new OrbitaError({ code: "orbita:not_found", status: 404, title: `${what} not found` }),
  conflict: (detail?: string): OrbitaError =>
    new OrbitaError({
      code: "orbita:conflict",
      status: 409,
      title: "Conflict",
      ...(detail !== undefined ? { detail } : {}),
    }),
  tooManyRequests: (): OrbitaError =>
    new OrbitaError({ code: "orbita:rate_limited", status: 429, title: "Too many requests" }),
  internal: (): OrbitaError =>
    new OrbitaError({ code: "orbita:internal", status: 500, title: "Internal error" }),
} as const;
