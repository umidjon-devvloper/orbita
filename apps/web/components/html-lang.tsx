"use client";

import { useEffect } from "react";

/**
 * Keeps `<html lang>` in sync with the active locale segment. The root
 * layout renders `lang="uz"` for the first paint (we need to pick
 * something before React hydrates); this hook updates it client-side so
 * assistive tech, hyphenation and spell-check follow the viewer's
 * choice without a full reload.
 */
export function HtmlLang({ locale }: { readonly locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
