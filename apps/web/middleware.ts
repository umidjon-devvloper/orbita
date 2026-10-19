import createMiddleware from "next-intl/middleware";
import { routing } from "./lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on everything except Next's internals, the API proxy and static assets.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
