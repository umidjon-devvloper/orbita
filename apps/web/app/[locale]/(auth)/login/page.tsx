import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./form";

export default async function LoginPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LoginShell locale={locale} />;
}

function LoginShell({ locale }: { readonly locale: string }) {
  const t = useTranslations("auth.login");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <LoginForm locale={locale} />
        <div className="pt-2 border-t border-rule text-center">
          <Link
            href={`/${locale}/forgot`}
            className="text-sm text-fg-muted hover:text-fg hover:underline underline-offset-4"
          >
            {t("forgot")}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
