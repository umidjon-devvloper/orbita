import { describe, expect, it } from "vitest";
import { clamp, divFloor, divHalfUp, min, sum } from "./math.js";
import { parseUzs, roundDownToStep, roundHalfUpToStep, serializeUzs } from "./money.js";
import { err, ok } from "./result.js";
import { formatBpAsPercent, formatScore, isValidScore, parsePercentToBp, parseScore } from "./score.js";

describe("math", () => {
  it("rounds half up", () => {
    expect(divHalfUp(5n, 10n)).toBe(1n);
    expect(divHalfUp(4n, 10n)).toBe(0n);
    expect(divHalfUp(15n, 10n)).toBe(2n);
    expect(divHalfUp(0n, 7n)).toBe(0n);
  });
  it("floors", () => expect(divFloor(19n, 10n)).toBe(1n));
  it("rejects bad operands instead of silently returning garbage", () => {
    expect(() => divHalfUp(1n, 0n)).toThrow(RangeError);
    expect(() => divHalfUp(-1n, 2n)).toThrow(RangeError);
    expect(() => divFloor(1n, 0n)).toThrow(RangeError);
    expect(() => divFloor(-1n, 2n)).toThrow(RangeError);
  });
  it("clamps, sums, mins", () => {
    expect([clamp(-1n, 0n, 9n), clamp(5n, 0n, 9n), clamp(10n, 0n, 9n)]).toEqual([0n, 5n, 9n]);
    expect(sum([])).toBe(0n);
    expect(sum([1n, 2n])).toBe(3n);
    expect([min(1n, 2n), min(3n, 2n)]).toEqual([1n, 2n]);
  });
});

describe("score", () => {
  it.each([
    ["81.97", 8197n],
    ["81.9", 8190n],
    ["81", 8100n],
    ["0", 0n],
    [" 100.00 ", 10000n],
  ])("parses %s", (text, value) => expect(parseScore(text)).toEqual(ok(value)));

  it.each(["100.01", "-1", "1.234", "abc", "", "1e2", "81,97"])("rejects %s", (text) =>
    expect(parseScore(text)).toEqual(err("score.invalid", { text })),
  );

  it("formats", () => {
    expect(formatScore(8197n)).toBe("81.97");
    expect(formatScore(5n)).toBe("0.05");
    expect(formatScore(-250n)).toBe("-2.50");
    expect(formatBpAsPercent(3000n)).toBe("30.00");
    expect(parsePercentToBp("12.5")).toEqual(ok(1250n));
  });

  it("validates range", () => {
    expect([isValidScore(-1n), isValidScore(0n), isValidScore(10000n), isValidScore(10001n)]).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});

describe("money", () => {
  it("parses whole UZS only", () => {
    expect(parseUzs("6000000")).toEqual(ok(6_000_000n));
    for (const bad of ["-1", "1.5", "6 000 000", "", "1234567890123456"])
      expect(parseUzs(bad).ok).toBe(false);
  });
  it("serializes as string", () => expect(serializeUzs(6_000_000n)).toBe("6000000"));
  it("rounds to step", () => {
    expect(roundDownToStep(1_639_999n, 1000n)).toBe(1_639_000n);
    expect(roundHalfUpToStep(6_286_667n, 1000n)).toBe(6_287_000n);
    expect(roundHalfUpToStep(6_286_499n, 1000n)).toBe(6_286_000n);
  });
});

describe("result", () => {
  it("omits details when not given", () => {
    expect(err("x")).toEqual({ ok: false, error: { code: "x" } });
    expect(err("x", { a: 1 })).toEqual({ ok: false, error: { code: "x", details: { a: 1 } } });
  });
});
