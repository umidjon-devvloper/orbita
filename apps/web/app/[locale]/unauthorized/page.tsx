import { setRequestLocale } from "next-intl/server";
import { StatusScreen } from "@/components/status-screen";

export const dynamic = "force-dynamic";

export default async function UnauthorizedPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StatusScreen statusKey="unauthenticated" locale={locale} actionHref="/login" />;
}
