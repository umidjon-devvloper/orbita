import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import type { Competency, Specialty } from "../catalog/client";
import { RubricsClient, type Rubric } from "./client";

export const dynamic = "force-dynamic";

export default async function RubricsPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  const cookie = await cookieHeader();
  const [rubrics, specs, comps] = await Promise.all([
    apiFetch<{ rubrics: Rubric[] }>("/api/v1/rubrics", { cookie }),
    apiFetch<{ specialties: Specialty[] }>("/api/v1/catalog/specialties", { cookie }),
    apiFetch<{ competencies: Competency[] }>("/api/v1/catalog/competencies", { cookie }),
  ]);
  return (
    <AppShell locale={locale}>
      <div className="max-w-6xl">
        <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
        <RubricsClient
          initialRubrics={rubrics.rubrics}
          specialties={specs.specialties.filter((s) => s.isActive)}
          competencies={comps.competencies.filter((c) => c.isActive)}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}

function title(l: string): string {
  return l === "ru" ? "Рубрики оценки" : l === "en" ? "Assessment rubrics" : "Baholash rubrikalari";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Специальность × цель. Версии DRAFT → ACTIVE → RETIRED. Редактируется только DRAFT; клонируйте, чтобы изменить ACTIVE."
    : l === "en"
      ? "Specialty × purpose. Versions go DRAFT → ACTIVE → RETIRED. Only DRAFT is editable; clone to change an ACTIVE version."
      : "Mutaxassislik × maqsad. Versiyalar: DRAFT → ACTIVE → RETIRED. Faqat DRAFT tahrirlanadi; ACTIVE'ni o'zgartirish uchun klon oling.";
}
