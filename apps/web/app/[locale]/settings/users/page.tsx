import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api/client";
import { cookieHeader, requireMe } from "@/lib/auth/require";
import { UsersClient, type OrgUnit, type Role, type UserRow } from "./client";

export const dynamic = "force-dynamic";

export default async function UsersPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireMe(locale);
  const cookie = await cookieHeader();
  const [users, roles, units] = await Promise.all([
    apiFetch<{ users: UserRow[] }>("/api/v1/users", { cookie }),
    apiFetch<{ roles: Role[] }>("/api/v1/users/roles", { cookie }),
    apiFetch<{ units: OrgUnit[] }>("/api/v1/org-units", { cookie }),
  ]);
  return (
    <AppShell locale={locale}>
      <div className="max-w-5xl">
        <PageHeader eyebrow="Settings" title={title(locale)} subtitle={subtitle(locale)} />
        <UsersClient
          initialUsers={users.users}
          roles={roles.roles}
          units={units.units}
          myUserId={me.user.id}
        />
      </div>
    </AppShell>
  );
}

function title(l: string): string {
  return l === "ru" ? "Пользователи" : l === "en" ? "Users" : "Foydalanuvchilar";
}
function subtitle(l: string): string {
  return l === "ru"
    ? "Создайте пользователя; пароль задаётся через восстановление пароля."
    : l === "en"
      ? "Create a user; their password is set via password reset."
      : "Foydalanuvchi yarating; parol parol tiklash orqali belgilanadi.";
}
