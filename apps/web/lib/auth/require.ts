import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";

export interface Me {
  user: { id: string; email: string; orgId: string; locale: string; theme: string };
}

/**
 * Server Component guard. Resolves the viewer from the API and returns
 * their profile; a 401 bounces to the sign-in page for the given locale,
 * a 403 to the forbidden page. Any other error propagates so the
 * route-level error boundary can log it.
 *
 * Keeping this in one place means admin pages never duplicate the
 * cookie-forwarding + status-code mapping boilerplate.
 */
export async function requireMe(locale: string): Promise<Me> {
  const cookieHeader = (await cookies()).toString();
  try {
    return await apiFetch<Me>("/api/v1/auth/me", { cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/login`);
    if (err instanceof ApiError && err.status === 403) redirect(`/${locale}/forbidden`);
    throw err;
  }
}

/** Forward the request cookies to the API — convenience for RSCs that fetch directly. */
export async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}
