import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

type StatusKey = "unauthenticated" | "forbidden" | "notFound";

/**
 * A single reusable screen for 401/403/404-style stops. Keeps the chrome
 * (brand, locale, theme) consistent so people reaching one of these
 * screens still know where they are and can switch locale to re-read in
 * their own language.
 */
export function StatusScreen({
  statusKey,
  locale,
  actionHref,
}: {
  readonly statusKey: StatusKey;
  readonly locale: string;
  readonly actionHref: string;
}) {
  const t = useTranslations(`status.${statusKey}`);
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
        <div className="max-w-md w-full text-center">
          <p className="text-xs uppercase tracking-widest text-fg-dim font-mono mb-3">
            {statusKey === "unauthenticated" ? "401" : statusKey === "forbidden" ? "403" : "404"}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{t("title")}</h1>
          <p className="text-fg-muted mt-3 text-sm">{t("detail")}</p>
          <div className="mt-6">
            <Link
              href={`/${locale}${actionHref}`}
              className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-surface text-fg border border-rule-strong hover:bg-surface-sunken transition-colors"
            >
              {t("action")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
