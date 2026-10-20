import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const minimal: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("loadConfig", () => {
  it("fills defaults when only required keys are present", () => {
    const c = loadConfig(minimal);
    expect(c.NODE_ENV).toBe("development");
    expect(c.DEFAULT_LOCALE).toBe("uz");
    expect(c.PORT).toBe(4000);
    expect(c.AI_PROVIDER).toBe("mock");
    expect(c.BRAND_NAME).toBe("Orbita");
  });

  it("coerces PORT from a string", () => {
    const c = loadConfig({ ...minimal, PORT: "5000" });
    expect(c.PORT).toBe(5000);
  });

  it("rejects an invalid locale", () => {
    expect(() => loadConfig({ ...minimal, DEFAULT_LOCALE: "fr" })).toThrow(/DEFAULT_LOCALE/);
  });

  it("rejects a short session secret", () => {
    expect(() => loadConfig({ ...minimal, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("rejects a missing database url", () => {
    const rest: NodeJS.ProcessEnv = { SESSION_SECRET: minimal.SESSION_SECRET };
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ ...minimal, PORT: "0" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...minimal, PORT: "70000" })).toThrow(/PORT/);
  });

  it("reports every failing key in one error", () => {
    const bad: NodeJS.ProcessEnv = { DEFAULT_LOCALE: "fr", SESSION_SECRET: "x", PORT: "0" };
    const err = (() => {
      try {
        loadConfig(bad);
        return undefined;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(err).toBeDefined();
    expect(err).toMatch(/DEFAULT_LOCALE/);
    expect(err).toMatch(/SESSION_SECRET/);
    expect(err).toMatch(/PORT/);
    expect(err).toMatch(/DATABASE_URL/);
  });
});
