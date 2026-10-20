"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = "light" | "dark" | "system";
const modes: readonly Mode[] = ["light", "dark", "system"];

const Icon: Record<Mode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Three-way theme switch. Pre-mount the icons render identically whatever
 * the server guessed, then hydrate to the real value — stops a flash of
 * the wrong icon on reload. State lives in `next-themes`, which uses
 * `data-theme` on <html> (see RootLayout) so our tokens pick it up.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const current: Mode = modes.includes(theme as Mode) ? (theme as Mode) : "system";

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex rounded-sm border border-rule-strong p-0.5 bg-surface"
    >
      {modes.map((mode) => {
        const IconMode = Icon[mode];
        const active = mounted && current === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setTheme(mode);
            }}
            aria-label={t(mode)}
            aria-pressed={active}
            className={cn(
              "h-7 w-7 inline-flex items-center justify-center rounded-sm transition-colors",
              active ? "bg-accent-soft text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-sunken",
            )}
          >
            <IconMode className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
