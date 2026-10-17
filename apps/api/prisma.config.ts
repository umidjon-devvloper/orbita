import { defineConfig, env } from "prisma/config";

// Prisma 7: the connection URL lives here, not in schema.prisma.
// Migrations run as the migrator role; the app connects as orbita_app at runtime.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
