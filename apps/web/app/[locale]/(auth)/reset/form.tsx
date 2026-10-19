"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface Values {
  password: string;
  confirm: string;
}

export function ResetForm({ token, locale }: { readonly token: string; readonly locale: string }) {
  const t = useTranslations("auth");
  const tr = useTranslations("auth.reset");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ mode: "onSubmit" });
  const password = watch("password");

  async function onSubmit(values: Values) {
    setServerError(null);
    if (values.password !== values.confirm) {
      setServerError(tr("mismatch"));
      return;
    }
    try {
      await apiFetch("/api/v1/auth/password-reset/confirm", {
        method: "POST",
        body: { token, newPassword: values.password },
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace(`/${locale}/login`);
      }, 1500);
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.code === "orbita:auth:invalid_reset_token"
          ? tr("invalidToken")
          : t("errors.unknown"),
      );
    }
  }

  if (success) {
    return (
      <p className="rounded-sm border border-good bg-good-soft text-fg px-4 py-3 text-sm">{tr("success")}</p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
      <Field
        htmlFor="password"
        label={tr("password")}
        error={
          errors.password?.type === "required"
            ? t("errors.required")
            : errors.password?.type === "minLength"
              ? t("errors.shortPassword")
              : undefined
        }
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={errors.password !== undefined}
          {...register("password", { required: true, minLength: 10 })}
        />
      </Field>
      <Field
        htmlFor="confirm"
        label={tr("confirm")}
        error={
          errors.confirm?.type === "required"
            ? t("errors.required")
            : watch("confirm").length > 0 && password !== watch("confirm")
              ? tr("mismatch")
              : undefined
        }
      >
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          invalid={errors.confirm !== undefined}
          {...register("confirm", { required: true })}
        />
      </Field>
      {serverError !== null && (
        <p role="alert" className="text-sm text-critical">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {tr("submit")}
      </Button>
    </form>
  );
}
