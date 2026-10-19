import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CircleUserRound, Gauge, Gift, ScrollText, Settings, Target, Users } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  readonly href: string;
  readonly labelKey: "dashboard" | "employees" | "candidates" | "assessments" | "rewards" | "settings";
  readonly icon: typeof Gauge;
}

const NAV: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: Gauge },
  { href: "/employees", labelKey: "employees", icon: Users },
  { href: "/candidates", labelKey: "candidates", icon: CircleUserRound },
  { href: "/assessments", labelKey: "assessments", icon: Target },
  { href: "/rewards", labelKey: "rewards", icon: Gift },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

/**
 * Application shell. A fixed left rail on desktop (collapsed to icons at
 * narrower widths, hidden on phones), a top bar with brand + user
 * controls, and a scrolling content region. The nav links point to
 * routes that don't exist yet — Phase 3 wires them up — so they are
 * rendered as `href` links that 404 for now rather than fake tabs. No
 * dead buttons.
 */
export function AppShell({ locale, children }: { readonly locale: string; readonly children: ReactNode }) {
  const t = useTranslations("nav");
  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      <header className="sticky top-0 z-10 bg-surface border-b border-rule">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden sm:inline text-fg-dim mx-2">·</span>
            <ScrollText className="h-4 w-4 text-fg-dim" aria-hidden />
            <span className="text-sm text-fg-muted">v0.1</span>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex-1 flex">
        <nav
          aria-label="Primary"
          className="hidden md:flex md:w-56 shrink-0 flex-col gap-0.5 border-r border-rule bg-surface p-3"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                className="flex items-center gap-3 h-9 px-3 rounded-sm text-sm text-fg-muted hover:text-fg hover:bg-surface-sunken transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 min-w-0 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
