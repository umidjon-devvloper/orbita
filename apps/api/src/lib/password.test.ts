import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";

describe("password", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct-horse-battery-staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("needsRehash is true for hashes with weaker parameters", () => {
    const weak = "$argon2id$v=19$m=4096,t=1,p=1$abcdefgh$ignored";
    expect(needsRehash(weak)).toBe(true);
  });

  it("needsRehash is false for hashes at current parameters", async () => {
    const hash = await hashPassword("x");
    expect(needsRehash(hash)).toBe(false);
  });

  it("needsRehash is true for an unrecognized shape", () => {
    expect(needsRehash("plaintext")).toBe(true);
  });
});
