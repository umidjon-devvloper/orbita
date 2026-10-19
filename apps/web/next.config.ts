import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  rewrites() {
    const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
    return Promise.resolve([{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }]);
  },
};

export default withNextIntl(config);
