"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/**
 * `next-themes` wrapper. We write the choice to `data-theme` on <html>
 * instead of `class` so the CSS tokens from `globals.css` pick it up
 * directly (the tokens target `:root[data-theme="dark"]`). The library's
 * inline script runs before React hydrates, which is what stops the
 * flash of the wrong theme.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
