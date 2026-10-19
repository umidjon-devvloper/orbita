import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES, LOCALE_LABEL } from "./locales";

describe("locales", () => {
  it("default locale is uz and all three are supported", () => {
    expect(DEFAULT_LOCALE).toBe("uz");
    expect(LOCALES).toEqual(["uz", "ru", "en"]);
  });

  it("isLocale accepts supported strings only", () => {
    expect(isLocale("uz")).toBe(true);
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(42)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("every supported locale has a display label", () => {
    for (const l of LOCALES) {
      expect(LOCALE_LABEL[l].length).toBeGreaterThan(0);
    }
  });
});
