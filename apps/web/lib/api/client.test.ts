import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

interface FakeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
}
type FakeFetch = ReturnType<typeof vi.fn<(input: string, init?: FakeInit) => Promise<Response>>>;

const original = globalThis.fetch;
let fetchMock: FakeFetch;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = original;
});

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

describe("apiFetch", () => {
  it("refuses a path that does not start with /api/v1/", async () => {
    await expect(apiFetch("/other")).rejects.toThrow(/path must start with/);
  });

  it("sends JSON content-type only when a body is given", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }, { "content-type": "application/json" }));
    await apiFetch("/api/v1/foo");
    const call = fetchMock.mock.calls[0]!;
    expect(call[1]!.headers!["Content-Type"]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }, { "content-type": "application/json" }));
    await apiFetch("/api/v1/foo", { method: "POST", body: { x: 1 } });
    const call2 = fetchMock.mock.calls[1]!;
    expect(call2[1]!.headers!["Content-Type"]).toBe("application/json");
    expect(call2[1]!.body).toBe(JSON.stringify({ x: 1 }));
  });

  it("forwards a server cookie when supplied", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }, { "content-type": "application/json" }));
    await apiFetch("/api/v1/foo", { cookie: "orbita_sid=abc" });
    expect(fetchMock.mock.calls[0]![1]!.headers!.Cookie).toBe("orbita_sid=abc");
  });

  it("throws ApiError with code and status from problem+json", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(401, {
        type: "about:blank",
        title: "Not signed in",
        status: 401,
        code: "orbita:unauthenticated",
      }),
    );
    const err = await apiFetch("/api/v1/foo").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).code).toBe("orbita:unauthenticated");
  });

  it("returns undefined on 204", async () => {
    fetchMock.mockResolvedValueOnce(reply(204, null));
    const result = await apiFetch("/api/v1/foo", { method: "POST" });
    expect(result).toBeUndefined();
  });

  it("wraps a non-problem error body with orbita:client:unknown", async () => {
    fetchMock.mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }));
    const err = await apiFetch("/api/v1/foo").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("orbita:client:unknown");
    expect((err as ApiError).status).toBe(504);
  });
});
