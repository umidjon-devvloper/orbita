import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
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

/**
 * Dashboard. Server-side session check: the request's cookies are
 * forwarded to the API's `/auth/me`; a 401 bounces to the sign-in page
 * for this locale. On success the shell renders a plain welcome card
 * until Phase 3 adds real summary tiles — no fake numbers, no fake
 * activity.
 */
export default async function DashboardPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [cookieStore] = await Promise.all([cookies(), headers()]);
  const cookieHeader = cookieStore.toString();
  try {
    const me = await apiFetch<Me>("/api/v1/auth/me", { cookie: cookieHeader });
    return <DashboardShell locale={locale} email={me.user.email} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/${locale}/login`);
    }
    throw err;
  }
}

function DashboardShell({ locale, email }: { readonly locale: string; readonly email: string }) {
  const t = useTranslations("nav");
  const tb = useTranslations("brand");
  return (
    <AppShell locale={locale}>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-wider text-fg-dim font-mono">{t("dashboard")}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{tb("tagline")}</h1>
        <p className="text-fg-muted mt-1 text-sm">{email}</p>
      </header>
      <div className="rounded-lg border border-rule bg-surface p-6">
        <p className="text-sm text-fg-muted">
          {/* No seeded KPI tiles — the configuration and assessment slices (Phase 3+) populate this. */}
          Dashboard tiles arrive once configuration is in place. For now, verify your sign-in flow and switch
          themes/languages above.
        </p>
      </div>
    </AppShell>
  );
}
