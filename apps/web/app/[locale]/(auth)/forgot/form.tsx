"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface Values {
  email: string;
}

/**
 * Password-reset request. The server deliberately returns the same 200
 * whether the email exists or not, so this form always shows the same
 * success message. We do not surface rate-limit errors to the user for
 * the same reason — they'd leak whether an email is on file.
 */
export function ForgotForm() {
  const t = useTranslations("auth");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ mode: "onSubmit" });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/password-reset/request", {
        method: "POST",
        body: { email: values.email.trim() },
      });
    } catch (err) {
      // Only truly unexpected errors surface — a 400 or 429 is swallowed to
      // match the server's identical-reply guarantee.
      if (err instanceof ApiError && err.status >= 500) {
        setSubmitting(false);
        return;
      }
    }
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <p className="rounded-sm border border-good bg-good-soft text-fg px-4 py-3 text-sm">
        {t("forgot.sent")}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
      <Field
        htmlFor="email"
        label={t("forgot.email")}
        error={errors.email !== undefined ? t("errors.required") : undefined}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          invalid={errors.email !== undefined}
          {...register("email", { required: true })}
        />
      </Field>
      <Button type="submit" size="lg" disabled={submitting}>
        {t("forgot.submit")}
      </Button>
    </form>
  );
}
