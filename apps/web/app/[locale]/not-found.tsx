import { StatusScreen } from "@/components/status-screen";

/**
 * Locale-scoped 404. The root `app/not-found.tsx` catches the pre-locale
 * case; this one handles everything inside a valid locale segment, so
 * the brand chrome and messages still localize.
 */
export default function LocaleNotFound() {
  // The locale is unavailable in notFound renders — fall back to the default.
  return <StatusScreen statusKey="notFound" locale="uz" actionHref="/dashboard" />;
}
