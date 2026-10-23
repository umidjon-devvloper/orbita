import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import { LevelsClient, type Level } from "./client";

export const dynamic = "force-dynamic";

export default async function LevelsPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  const data = await apiFetch<{ levels: Level[] }>("/api/v1/levels", { cookie: await cookieHeader() });
  return (
    <AppShell locale={locale}>
      <div className="max-w-3xl">
        <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
        <LevelsClient initialLevels={data.levels} />
      </div>
    </AppShell>
  );
}

function title(l: string): string {
  return l === "ru" ? "Карьерные уровни" : l === "en" ? "Career levels" : "Kareyra darajalari";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Уровни по rank-порядку. Новые добавляются в конец, с бейджем UNAPPROVED."
    : l === "en"
      ? "Levels in rank order. New levels append to the end with the UNAPPROVED badge."
      : "Darajalar daraxt tartibida. Yangi darajalar oxiriga qo'shiladi, UNAPPROVED badge olib qolinadi.";
}
