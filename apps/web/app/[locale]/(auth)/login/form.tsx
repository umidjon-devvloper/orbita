"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface Values {
  email: string;
  password: string;
}

interface LoginResponse {
  user: { id: string; email: string; locale: string };
  csrfToken: string;
}

/**
 * The login form. Validation runs in the browser (RHF + Zod could be
 * added later; here a bare type guard is enough and keeps the bundle
 * smaller). Server errors are mapped to a single top-of-form message by
 * `code` so an attacker cannot distinguish "wrong password" from
 * "unknown email" — both come back as `invalidCredentials`.
 */
export function LoginForm({ locale }: { readonly locale: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ mode: "onSubmit" });

  async function onSubmit(values: Values) {
    setServerError(null);
    try {
      await apiFetch<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { email: values.email.trim(), password: values.password },
      });
      startTransition(() => {
        router.replace(`/${locale}/dashboard`);
      });
    } catch (err) {
      setServerError(mapError(err, t));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
      <Field
        htmlFor="email"
        label={t("login.email")}
        error={errors.email !== undefined ? t("errors.required") : undefined}
      >
        <Input
          id="email"
          type="email"
          autoComplete="username"
          invalid={errors.email !== undefined}
          {...register("email", { required: true })}
        />
      </Field>
      <Field
        htmlFor="password"
        label={t("login.password")}
        error={errors.password !== undefined ? t("errors.required") : undefined}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={errors.password !== undefined}
          {...register("password", { required: true })}
        />
      </Field>
      {serverError !== null && (
        <p role="alert" className="text-sm text-critical">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("login.signingIn") : t("login.submit")}
      </Button>
    </form>
  );
}

function mapError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "orbita:auth:invalid_credentials":
        return t("errors.invalidCredentials");
      case "orbita:auth:locked":
        return t("errors.locked");
      case "orbita:auth:rate_limited":
        return t("errors.rateLimited");
      case "orbita:validation":
        return t("errors.invalidEmail");
    }
  }
  return t("errors.unknown");
}
