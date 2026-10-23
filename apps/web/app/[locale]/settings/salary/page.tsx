import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import type { Position } from "../catalog/client";
import type { Level } from "../levels/client";
import { SalaryClient, type SalaryBand } from "./client";

export const dynamic = "force-dynamic";

export default async function SalaryPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  const cookie = await cookieHeader();
  const [bands, pos, lvl] = await Promise.all([
    apiFetch<{ bands: SalaryBand[] }>("/api/v1/salary-bands", { cookie }),
    apiFetch<{ positions: Position[] }>("/api/v1/catalog/positions", { cookie }),
    apiFetch<{ levels: Level[] }>("/api/v1/levels", { cookie }),
  ]);
  return (
    <AppShell locale={locale}>
      <div className="max-w-5xl">
        <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
        <SalaryClient
          initialBands={bands.bands}
          positions={pos.positions.filter((p) => p.isActive)}
          levels={lvl.levels.filter((l) => l.isActive)}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}

function title(l: string): string {
  return l === "ru" ? "Зарплатные диапазоны" : l === "en" ? "Salary bands" : "Oylik diapazonlari";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Должность × уровень × окно дат. Перекрытия отклоняются."
    : l === "en"
      ? "Position × level × date window. Overlaps are refused."
      : "Lavozim × daraja × sana oynasi. Kesishishlar rad etiladi.";
}
