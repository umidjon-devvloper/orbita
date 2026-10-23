import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
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
 * is not yet written. We render the full AppShell with the correct nav
 * highlight, a short explanation of what the page will do, and an
 * illustrative preview mockup clearly labelled "example" (CLAUDE.md
 * forbids presenting demo data as real — the chip makes the stylized
 * boxes unambiguous).
 */
export function ComingSoon({ locale, section }: { readonly locale: string; readonly section: SectionKey }) {
  const tNav = useTranslations("nav");
  const t = useTranslations(`comingSoon.${section}`);
  const tOv = useTranslations(`overview.sections.${section}`);
  const tOverview = useTranslations("overview");
  return (
    <AppShell locale={locale}>
      <PageHeader eyebrow={tNav(NAV_LABEL[section])} title={t("title")} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 max-w-5xl">
        <div className="lg:col-span-3 rounded-lg border border-rule bg-surface p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">{tOv("title")}</h2>
          <p className="text-sm text-fg">{tOv("what")}</p>
          <p className="text-sm text-fg-muted">{tOv("why")}</p>
          <p className="text-xs text-fg-dim mt-4 pt-3 border-t border-rule">{t("detail")}</p>
        </div>
        <div className="lg:col-span-2 relative rounded-lg border border-dashed border-rule bg-surface-sunken p-4">
          <span className="absolute -top-2 left-3 text-[10px] font-mono uppercase tracking-wider px-1.5 bg-surface text-fg-dim border border-rule rounded">
            {tOverview("exampleLabel")}
          </span>
          <div className="mt-2">
            <Preview section={section} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Preview({ section }: { readonly section: SectionKey }): ReactNode {
  if (section === "employees") return <EmployeesMock />;
  if (section === "candidates") return <CandidatesMock />;
  if (section === "assessments") return <AssessmentsMock />;
  return <RewardsMock />;
}

function EmployeesMock() {
  const t = useTranslations("overview.preview.employees");
  return (
    <div className="rounded border border-rule bg-surface overflow-hidden">
      <div className="grid grid-cols-4 gap-2 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-fg-dim border-b border-rule">
        <span>{t("colName")}</span>
        <span>{t("colPosition")}</span>
        <span>{t("colLevel")}</span>
        <span>{t("colUnit")}</span>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="grid grid-cols-4 gap-2 px-2 py-2 border-b border-rule last:border-b-0"
          aria-hidden
        >
          <span className="h-2.5 rounded bg-surface-sunken" />
          <span className="h-2.5 rounded bg-surface-sunken" />
          <span className="h-2.5 rounded bg-surface-sunken w-3/4" />
          <span className="h-2.5 rounded bg-surface-sunken w-2/3" />
        </div>
      ))}
    </div>
  );
}

function CandidatesMock() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded border border-rule bg-surface p-2 flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-surface-sunken" />
          <div className="flex-1 flex flex-col gap-1">
            <span className="h-2 rounded bg-surface-sunken w-3/4" />
            <span className="h-2 rounded bg-surface-sunken w-1/2" />
          </div>
          <span className="h-5 w-14 rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}

function AssessmentsMock() {
  const t = useTranslations("overview.preview.assessments");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-xs" aria-hidden>
        <div className="rounded border border-rule bg-surface p-2 flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">{t("period")}</span>
          <span className="font-mono text-fg-muted">2026-01</span>
        </div>
        <div className="rounded border border-rule bg-surface p-2 flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">{t("score")}</span>
          <span className="h-3 w-full rounded bg-surface-sunken relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-[72%] bg-fg/20" />
          </span>
        </div>
        <div className="rounded border border-rule bg-surface p-2 flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">{t("status")}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-good bg-good-soft rounded px-1 py-0.5 self-start">
            DRAFT
          </span>
        </div>
      </div>
      <div className="rounded border border-rule bg-surface p-2 flex flex-col gap-1.5" aria-hidden>
        {[0.9, 0.75, 0.6, 0.55].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-16 rounded bg-surface-sunken" />
            <span className="h-2 flex-1 rounded bg-surface-sunken relative overflow-hidden">
              <span className="absolute inset-y-0 left-0 bg-fg/15" style={{ width: `${w * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardsMock() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="flex items-end gap-1 h-16">
        {[9, 8, 7, 5, 4, 3, 3].map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-fg/15" style={{ height: `${(h / 9) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded border border-rule bg-surface px-2 py-1.5"
          >
            <span className="h-2 w-20 rounded bg-surface-sunken" />
            <span className="h-2 w-16 rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
