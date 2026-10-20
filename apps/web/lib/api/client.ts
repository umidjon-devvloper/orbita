/**
 * Thin fetch wrapper for the Fastify API. In the browser the session
 * cookie travels with every request because the Next proxy keeps the
 * origin same (`/api/v1/*` is rewritten to the API). On the server we
 * forward the request cookies manually when we have them.
 *
 * The wrapper's single job is turning the problem+json contract into a
 * useful typed error — never silent, never a bare `Error("...")` with
 * a server-side stack mixed in.
 */

export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly errors?: readonly { readonly path: string; readonly message: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
    this.problem = problem;
  }
}

export interface RequestInit {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
  /** Only in a Server Component / Route Handler — forwards the user's cookie. */
  readonly cookie?: string;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/v1/")) {
    throw new Error(`apiFetch path must start with /api/v1/, got ${path}`);
  }
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json",
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init.cookie !== undefined ? { Cookie: init.cookie } : {}),
    ...init.headers,
  };
  const base = typeof window === "undefined" ? (process.env.API_URL ?? "http://127.0.0.1:4000") : "";
  const fetchInit: globalThis.RequestInit = {
    method,
    headers,
    credentials: "include",
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal !== undefined ? { signal: init.signal } : {}),
  };
  const res = await fetch(`${base}${path}`, fetchInit);

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("json") ? await res.json() : await res.text();

  if (!res.ok) {
    if (isProblem(body)) throw new ApiError(body);
    throw new ApiError({
      type: "about:blank",
      title: "Request failed",
      status: res.status,
      code: "orbita:client:unknown",
      ...(typeof body === "string" ? { detail: body } : {}),
    });
  }
  return body as T;
}

function isProblem(x: unknown): x is Problem {
  return (
    typeof x === "object" &&
    x !== null &&
    "code" in x &&
    "status" in x &&
    typeof (x as { code: unknown }).code === "string"
  );
}
