import { describe, expect, it } from "vitest";
import { constantTimeEqual, randomToken, sha256Hex, TOKEN_BYTES } from "./tokens.js";

describe("tokens", () => {
  it("generates a URL-safe token of expected length", () => {
    const t = randomToken();
    // 32 random bytes → base64url is 43 chars (no padding).
    expect(t).toHaveLength(43);
    expect(TOKEN_BYTES).toBe(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("respects a custom byte length", () => {
    expect(randomToken(16)).toHaveLength(22); // 16 bytes → 22 base64url chars
  });

  it("produces distinct tokens on each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) seen.add(randomToken());
    expect(seen.size).toBe(50);
  });

  it("sha256Hex is stable and 64 hex chars", () => {
    const h = sha256Hex("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("constantTimeEqual returns true only for identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
