import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./form";

export default async function ForgotPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ForgotShell locale={locale} />;
}

function ForgotShell({ locale }: { readonly locale: string }) {
  const t = useTranslations("auth.forgot");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <ForgotForm />
        <div className="pt-2 border-t border-rule text-center">
          <Link
            href={`/${locale}/login`}
            className="text-sm text-fg-muted hover:text-fg hover:underline underline-offset-4"
          >
            {t("back")}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
