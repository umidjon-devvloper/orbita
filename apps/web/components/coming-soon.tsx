import { useTranslations } from "next-intl";
import { AppShell } from "./app-shell";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

type SectionKey = "employees" | "candidates" | "assessments" | "rewards";

const NAV_LABEL: Record<SectionKey, "employees" | "candidates" | "assessments" | "rewards"> = {
  employees: "employees",
  candidates: "candidates",
  assessments: "assessments",
  rewards: "rewards",
};

/**
 * Shared screen for routes whose API is in place but whose dedicated UI
 * is not yet written. We render the full AppShell with the correct
 * nav highlight and an honest EmptyState — never fake rows or placeholder
 * KPIs (CLAUDE.md forbids demo-as-real).
 */
export function ComingSoon({ locale, section }: { readonly locale: string; readonly section: SectionKey }) {
  const tNav = useTranslations("nav");
  const t = useTranslations(`comingSoon.${section}`);
  return (
    <AppShell locale={locale}>
      <PageHeader eyebrow={tNav(NAV_LABEL[section])} title={t("title")} />
      <EmptyState title={t("title")} description={t("detail")} />
    </AppShell>
  );
}
