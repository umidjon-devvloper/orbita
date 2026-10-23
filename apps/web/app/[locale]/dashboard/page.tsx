import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Gift,
  Settings as SettingsIcon,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch, ApiError } from "@/lib/api/client";

/**
 * Dashboard is always rendered per request — it reads the viewer's
 * session cookie and asks the API who they are, so static pre-rendering
 * at build time (when the API is not running) would fail. `force-dynamic`
 * also keeps the response from being cached across users.
 */
export const dynamic = "force-dynamic";

interface Me {
  user: { id: string; email: string; orgId: string; locale: string; theme: string };
}

export default async function DashboardPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [cookieStore] = await Promise.all([cookies(), headers()]);
  const cookieHeader = cookieStore.toString();
  try {
    const me = await apiFetch<Me>("/api/v1/auth/me", { cookie: cookieHeader });
    return <Overview locale={locale} email={me.user.email} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/${locale}/login`);
    }
    throw err;
  }
}

/**
 * Guided tour of the system.
 *
 * The first page a signed-in user sees. Explains the four-stage pipeline,
 * every section (ready + soon) with an illustrative preview card, and a
 * numbered checklist for first-time setup. Every preview carries a
 * "misol / пример / example" chip so no viewer mistakes the stylized
 * boxes for live data (CLAUDE.md: never present demo data as real).
 */
function Overview({ locale, email }: { readonly locale: string; readonly email: string }) {
  const t = useTranslations("overview");
  const tb = useTranslations("brand");

  return (
    <AppShell locale={locale}>
      <header className="mb-10">
        <p className="text-xs uppercase tracking-wider text-fg-dim font-mono">
          {t("greeting")} — {email}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-2">{tb("tagline")}</h1>
        <p className="text-fg-muted mt-3 max-w-3xl text-sm leading-relaxed">{t("lead")}</p>
      </header>

      <section className="mb-12">
        <SectionTitle title={t("flow.title")} subtitle={t("flow.subtitle")} />
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <FlowCard
            n={1}
            icon={<SettingsIcon className="h-4 w-4" aria-hidden />}
            title={t("flow.s1Title")}
            detail={t("flow.s1Detail")}
          />
          <FlowCard
            n={2}
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            title={t("flow.s2Title")}
            detail={t("flow.s2Detail")}
          />
          <FlowCard
            n={3}
            icon={<Target className="h-4 w-4" aria-hidden />}
            title={t("flow.s3Title")}
            detail={t("flow.s3Detail")}
          />
          <FlowCard
            n={4}
            icon={<Gift className="h-4 w-4" aria-hidden />}
            title={t("flow.s4Title")}
            detail={t("flow.s4Detail")}
          />
        </ol>
      </section>

      <section className="mb-12">
        <SectionTitle title={t("sections.title")} subtitle={t("sections.subtitle")} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard
            locale={locale}
            href="/settings"
            ready
            icon={<SettingsIcon className="h-5 w-5" aria-hidden />}
            title={t("sections.settings.title")}
            what={t("sections.settings.what")}
            why={t("sections.settings.why")}
            preview={<SettingsPreview />}
          />
          <SectionCard
            locale={locale}
            href="/employees"
            ready={false}
            icon={<Users className="h-5 w-5" aria-hidden />}
            title={t("sections.employees.title")}
            what={t("sections.employees.what")}
            why={t("sections.employees.why")}
            preview={<EmployeesPreview />}
          />
          <SectionCard
            locale={locale}
            href="/candidates"
            ready={false}
            icon={<UserPlus className="h-5 w-5" aria-hidden />}
            title={t("sections.candidates.title")}
            what={t("sections.candidates.what")}
            why={t("sections.candidates.why")}
            preview={<CandidatesPreview />}
          />
          <SectionCard
            locale={locale}
            href="/assessments"
            ready={false}
            icon={<BarChart3 className="h-5 w-5" aria-hidden />}
            title={t("sections.assessments.title")}
            what={t("sections.assessments.what")}
            why={t("sections.assessments.why")}
            preview={<AssessmentsPreview />}
          />
          <SectionCard
            locale={locale}
            href="/rewards"
            ready={false}
            icon={<Gift className="h-5 w-5" aria-hidden />}
            title={t("sections.rewards.title")}
            what={t("sections.rewards.what")}
            why={t("sections.rewards.why")}
            preview={<RewardsPreview />}
          />
        </div>
      </section>

      <section>
        <SectionTitle title={t("checklist.title")} subtitle={t("checklist.subtitle")} />
        <ol className="rounded-lg border border-rule bg-surface overflow-hidden">
          {(["s1", "s2", "s3", "s4", "s5", "s6"] as const).map((k) => (
            <li key={k} className="flex items-start gap-3 px-4 py-3 border-b border-rule last:border-b-0">
              <CheckCircle2 className="h-4 w-4 text-fg-dim mt-0.5 shrink-0" aria-hidden />
              <span className="text-sm text-fg">{t(`checklist.${k}`)}</span>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}

function SectionTitle({ title, subtitle }: { readonly title: string; readonly subtitle: string }) {
  return (
    <header className="mb-4">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-fg-muted mt-1">{subtitle}</p>
    </header>
  );
}

function FlowCard({
  n,
  icon,
  title,
  detail,
}: {
  readonly n: number;
  readonly icon: ReactNode;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <li className="rounded-lg border border-rule bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="h-6 w-6 rounded-full border border-rule-strong text-xs font-mono tabular-nums flex items-center justify-center text-fg-muted"
          aria-hidden
        >
          {n.toString()}
        </span>
        <span className="text-fg-dim">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="text-xs text-fg-muted leading-relaxed">{detail}</p>
    </li>
  );
}

function SectionCard({
  locale,
  href,
  ready,
  icon,
  title,
  what,
  why,
  preview,
}: {
  readonly locale: string;
  readonly href: string;
  readonly ready: boolean;
  readonly icon: ReactNode;
  readonly title: string;
  readonly what: string;
  readonly why: string;
  readonly preview: ReactNode;
}) {
  const t = useTranslations("overview");
  return (
    <article className="rounded-lg border border-rule bg-surface p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-fg-dim">{icon}</span>
          <h3 className="font-display text-lg font-semibold truncate">{title}</h3>
        </div>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
            ready ? "text-good bg-good-soft" : "text-fg-dim bg-surface-sunken"
          }`}
        >
          {ready ? t("sections.ready") : t("sections.soon")}
        </span>
      </header>
      <div className="text-sm space-y-2">
        <p className="text-fg">{what}</p>
        <p className="text-fg-muted">{why}</p>
      </div>
      <div className="relative rounded-md border border-dashed border-rule bg-surface-sunken p-3">
        <span className="absolute -top-2 left-3 text-[10px] font-mono uppercase tracking-wider px-1.5 bg-surface text-fg-dim border border-rule rounded">
          {t("exampleLabel")}
        </span>
        <div className="mt-2">{preview}</div>
      </div>
      <footer className="flex justify-end">
        <Link
          href={`/${locale}${href}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-fg hover:text-fg-muted transition-colors"
        >
          {t("sections.open")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </footer>
    </article>
  );
}

/* --- Illustrative previews. Every one carries the exampleLabel chip. --- */

function SettingsPreview() {
  const t = useTranslations("overview.preview.settings");
  const items: readonly string[] = [
    t("orgUnits"),
    t("users"),
    t("catalog"),
    t("levels"),
    t("salary"),
    t("rubrics"),
  ];
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {items.map((label) => (
        <li
          key={label}
          className="h-7 rounded border border-rule bg-surface px-2 flex items-center text-xs text-fg-muted"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

function EmployeesPreview() {
  const t = useTranslations("overview.preview.employees");
  return (
    <div className="rounded border border-rule bg-surface overflow-hidden">
      <div className="grid grid-cols-4 gap-2 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-fg-dim border-b border-rule">
        <span>{t("colName")}</span>
        <span>{t("colPosition")}</span>
        <span>{t("colLevel")}</span>
        <span>{t("colUnit")}</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid grid-cols-4 gap-2 px-2 py-1.5 border-b border-rule last:border-b-0"
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

function CandidatesPreview() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <div className="h-16 flex-1 rounded border border-rule bg-surface p-2 flex flex-col gap-1 justify-end">
        <span className="h-2 rounded bg-surface-sunken w-3/4" />
        <span className="h-2 rounded bg-surface-sunken w-1/2" />
      </div>
      <ArrowRight className="h-4 w-4 text-fg-dim" />
      <div className="h-16 flex-1 rounded border border-rule bg-surface p-2 flex flex-col gap-1 justify-end">
        <span className="h-2 rounded bg-surface-sunken w-full" />
        <span className="h-6 rounded bg-good-soft/60" />
      </div>
    </div>
  );
}

function AssessmentsPreview() {
  const t = useTranslations("overview.preview.assessments");
  return (
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
  );
}

function RewardsPreview() {
  return (
    <div className="flex items-end gap-1 h-16" aria-hidden>
      {[9, 8, 7, 5, 4, 3, 3].map((h, i) => (
        <span key={i} className="flex-1 rounded-t bg-fg/15" style={{ height: `${(h / 9) * 100}%` }} />
      ))}
    </div>
  );
}
