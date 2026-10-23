import { setRequestLocale } from "next-intl/server";
import { ComingSoon } from "@/components/coming-soon";
import { requireMe } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

export default async function CandidatesPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireMe(locale);
  return <ComingSoon locale={locale} section="candidates" />;
}
