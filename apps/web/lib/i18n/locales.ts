/**
 * Supported locales. Uzbek (Latin script) is the default; Russian and
 * English are peers. Order matters — the first entry is the fallback for
 * the middleware's negotiator.
 */
export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "uz";

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

export const LOCALE_LABEL: Record<Locale, string> = {
  uz: "O'zbekcha",
  ru: "Русский",
  en: "English",
};
