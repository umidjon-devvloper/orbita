import { redirect } from "next/navigation";

/**
 * Root of a locale. Both `/` and `/uz` land on the dashboard; that page
 * is responsible for bouncing unauthenticated visitors to sign-in, so
 * the redirect lives in one place.
 */
export default async function LocaleHome({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
