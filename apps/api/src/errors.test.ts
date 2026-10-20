import { describe, it, expect } from "vitest";
import { Errors, OrbitaError, PROBLEM_CONTENT_TYPE } from "./errors.js";

describe("errors", () => {
  it("validation carries field errors and status 400", () => {
    const err = Errors.validation([{ path: "email", message: "Required" }]);
    expect(err).toBeInstanceOf(OrbitaError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("orbita:validation");
    expect(err.errors).toEqual([{ path: "email", message: "Required" }]);
  });

  it("notFound uses the provided subject in its title", () => {
    const err = Errors.notFound("Employee");
    expect(err.status).toBe(404);
    expect(err.title).toBe("Employee not found");
    expect(err.code).toBe("orbita:not_found");
  });

  it("conflict passes an optional detail through", () => {
    const err = Errors.conflict("Duplicate key");
    expect(err.status).toBe(409);
    expect(err.message).toBe("Duplicate key");
  });

  it("unauthenticated and forbidden have distinct codes", () => {
    expect(Errors.unauthenticated().code).toBe("orbita:unauthenticated");
    expect(Errors.forbidden().code).toBe("orbita:forbidden");
  });

  it("content type is problem+json", () => {
    expect(PROBLEM_CONTENT_TYPE).toBe("application/problem+json");
  });
});
