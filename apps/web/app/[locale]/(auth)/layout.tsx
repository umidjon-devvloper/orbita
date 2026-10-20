import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared chrome for the sign-in flow. Keeps the layout centred on
 * desktop and full-width on phones, with the brand mark at the top and
 * the locale/theme toggles stacked below the card. Deliberately leaves
 * room on the sides at every viewport (no hero image, no illustration)
 * so the eye lands on the form.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
