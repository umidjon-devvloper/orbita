import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireMe } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

export default async function SettingsIndexPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  return (
    <AppShell locale={locale}>
      <Shell locale={locale} />
    </AppShell>
  );
}

interface Entry {
  readonly href: string;
  readonly key: "orgUnits" | "users" | "catalog" | "levels" | "salary" | "rubrics";
  readonly ready: boolean;
}

const ENTRIES: readonly Entry[] = [
  { href: "/settings/org-units", key: "orgUnits", ready: true },
  { href: "/settings/users", key: "users", ready: true },
  { href: "/settings/catalog", key: "catalog", ready: false },
  { href: "/settings/levels", key: "levels", ready: false },
  { href: "/settings/salary", key: "salary", ready: false },
  { href: "/settings/rubrics", key: "rubrics", ready: false },
];

function Shell({ locale }: { readonly locale: string }) {
  const t = useTranslations("settings.index");
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ENTRIES.map((e) => {
          const title = t(e.key);
          const note = t(`${e.key}Note`);
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-fg">{title}</p>
                {e.ready ? (
                  <ArrowUpRight className="h-4 w-4 text-fg-dim shrink-0" aria-hidden />
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim bg-surface-sunken px-1.5 py-0.5 rounded">
                    soon
                  </span>
                )}
              </div>
              <p className="text-sm text-fg-muted mt-1">{note}</p>
            </>
          );
          return (
            <li key={e.href}>
              {e.ready ? (
                <Link
                  href={`/${locale}${e.href}`}
                  className="block h-full rounded-lg border border-rule bg-surface p-5 hover:border-rule-strong hover:bg-surface-sunken transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div className="h-full rounded-lg border border-rule bg-surface p-5 opacity-70 cursor-not-allowed">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
