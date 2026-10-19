import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "./locales";

/**
 * next-intl's per-request config. The incoming `requestLocale` is whatever
 * segment the middleware matched; we validate it (never trust path input)
 * and load that locale's messages. An unknown locale falls through to
 * `notFound()` so a stray `/fr/...` returns 404 instead of silently
 * rendering an empty page.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl marks `requestLocale` deprecated in favour of next/root-params,
  // which requires Next.js 15.4+ bits still in flux — stick with the stable
  // API for this slice and migrate when root-params lands as non-experimental.
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  if (requested !== undefined && !isLocale(requested)) notFound();
  const mod = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale, messages: mod.default };
});
