import { describe, expect, it } from "vitest";
import { createRateLimit } from "./rate-limit.js";

const T0 = new Date("2026-10-19T10:00:00Z");

describe("rate-limit", () => {
  it("allows up to max hits inside the window and rejects the next", () => {
    const rl = createRateLimit({ max: 3, windowMs: 60_000 });
    expect(rl.hit("a", T0)).toBe(true);
    expect(rl.hit("a", T0)).toBe(true);
    expect(rl.hit("a", T0)).toBe(true);
    expect(rl.hit("a", T0)).toBe(false);
    expect(rl.peek("a", T0)).toBe(3);
  });

  it("counts keys independently", () => {
    const rl = createRateLimit({ max: 1, windowMs: 1_000 });
    expect(rl.hit("a", T0)).toBe(true);
    expect(rl.hit("b", T0)).toBe(true);
    expect(rl.hit("a", T0)).toBe(false);
  });

  it("expires hits once they fall out of the window", () => {
    const rl = createRateLimit({ max: 2, windowMs: 60_000 });
    rl.hit("k", T0);
    rl.hit("k", T0);
    expect(rl.hit("k", T0)).toBe(false);
    const later = new Date(T0.getTime() + 61_000);
    expect(rl.hit("k", later)).toBe(true);
  });

  it("reset clears the counter immediately", () => {
    const rl = createRateLimit({ max: 1, windowMs: 60_000 });
    rl.hit("x", T0);
    expect(rl.hit("x", T0)).toBe(false);
    rl.reset("x");
    expect(rl.hit("x", T0)).toBe(true);
  });

  it("peek does not add a hit", () => {
    const rl = createRateLimit({ max: 2, windowMs: 60_000 });
    expect(rl.peek("y", T0)).toBe(0);
    rl.hit("y", T0);
    expect(rl.peek("y", T0)).toBe(1);
    expect(rl.peek("y", T0)).toBe(1);
  });
});
