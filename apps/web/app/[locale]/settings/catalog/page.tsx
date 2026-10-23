import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import { CatalogClient, type Competency, type Position, type Specialty } from "./client";

export const dynamic = "force-dynamic";

export default async function CatalogPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  const cookie = await cookieHeader();
  const [spec, pos, comp] = await Promise.all([
    apiFetch<{ specialties: Specialty[] }>("/api/v1/catalog/specialties", { cookie }),
    apiFetch<{ positions: Position[] }>("/api/v1/catalog/positions", { cookie }),
    apiFetch<{ competencies: Competency[] }>("/api/v1/catalog/competencies", { cookie }),
  ]);
  return (
    <AppShell locale={locale}>
      <div className="max-w-5xl">
        <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
        <CatalogClient
          initialSpecialties={spec.specialties}
          initialPositions={pos.positions}
          initialCompetencies={comp.competencies}
        />
      </div>
    </AppShell>
  );
}

function title(l: string): string {
  return l === "ru" ? "Каталог" : l === "en" ? "Catalog" : "Katalog";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Специальность, должность, компетенция — все названия локализуются (uz обязателен)."
    : l === "en"
      ? "Specialty, position, competency — every name is localized (uz required)."
      : "Mutaxassislik, lavozim, kompetensiya — barcha nomlar lokalizatsiya qilinadi (uz majburiy).";
}
