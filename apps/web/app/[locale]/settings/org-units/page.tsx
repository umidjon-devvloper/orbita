import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import { OrgUnitsClient, type OrgUnit } from "./client";

export const dynamic = "force-dynamic";

/**
 * Admin tree view for org units. The RSC loads the current list under
 * the viewer's grant scope, then hands it to the client component which
 * owns every mutation. Server-side fetch forwards cookies so the API
 * sees the viewer's session; a 401/403 is handled by requireMe.
 */
export default async function OrgUnitsPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  const data = await apiFetch<{ units: OrgUnit[] }>("/api/v1/org-units", {
    cookie: await cookieHeader(),
  });
  return (
    <AppShell locale={locale}>
      <Shell locale={locale} units={data.units} />
    </AppShell>
  );
}

function Shell({ locale, units }: { readonly locale: string; readonly units: OrgUnit[] }) {
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
      <OrgUnitsClient initialUnits={units} />
    </div>
  );
}

// Static labels so this file renders without hitting the server translator.
// The client component uses next-intl for everything interactive.
function title(l: string): string {
  return l === "ru" ? "Организационные единицы" : l === "en" ? "Organizational units" : "Tashkiliy birliklar";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Дерево. Новые узлы создаются только внутри родителя."
    : l === "en"
      ? "Tree. New nodes are created only inside a parent."
      : "Daraxt. Yangi tugunlar faqat ota tugun ichida yaratiladi.";
}
