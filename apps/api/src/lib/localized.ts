import { z } from "zod";

/**
 * Localized text. Uzbek (Latin) is required because it is the system's
 * default locale (D-23); Russian and English are optional peers. A read
 * site always has a non-empty uz string to fall back to, so the UI never
 * renders an empty label even when a translator hasn't filled the other
 * fields yet.
 */
export const LocalizedTextSchema = z.object({
  uz: z.string().min(1).max(400),
  ru: z.string().min(1).max(400).optional(),
  en: z.string().min(1).max(400).optional(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Pick the viewer's locale, falling back to uz. */
export function localizedPick(text: LocalizedText, locale: "uz" | "ru" | "en"): string {
  return text[locale] ?? text.uz;
}
