import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./form";

export default async function ResetPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  return <ResetShell locale={locale} token={sp.token} />;
}

function ResetShell({ locale, token }: { readonly locale: string; readonly token: string | undefined }) {
  const t = useTranslations("auth");
  const tr = useTranslations("auth.reset");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("title")}</CardTitle>
        <CardDescription>{tr("subtitle")}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {token === undefined ? (
          <p role="alert" className="text-sm text-critical">
            {tr("missingToken")}
          </p>
        ) : (
          <ResetForm token={token} locale={locale} />
        )}
        <div className="pt-2 border-t border-rule text-center">
          <Link
            href={`/${locale}/login`}
            className="text-sm text-fg-muted hover:text-fg hover:underline underline-offset-4"
          >
            {t("forgot.back")}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
