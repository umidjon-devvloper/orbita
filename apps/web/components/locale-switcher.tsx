"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/locales";
import { usePathname, useRouter } from "@/lib/i18n/routing";

/**
 * Locale picker. Uses next-intl's routing helpers so the new segment is
 * written straight into the URL — a reload lands in the chosen locale,
 * links from this session also carry it. We never fire-and-forget: the
 * router handles the transition so React keeps the current scroll and
 * form state intact where possible.
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: Locale) {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        onChange={(e) => {
          onChange(e.target.value as Locale);
        }}
        disabled={pending}
        aria-label={t("label")}
        className="h-8 rounded-sm border border-rule-strong bg-surface px-2 text-sm text-fg
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
