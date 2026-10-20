import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/*.test.ts",
            "apps/*/src/**/*.test.ts",
            "apps/web/lib/**/*.test.ts",
            "apps/web/components/**/*.test.ts",
          ],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        // Needs Postgres (docker compose up -d) and DATABASE_URL_TEST; recreates that database.
        test: {
          name: "db",
          include: ["apps/*/src/**/*.db.test.ts"],
          globalSetup: ["apps/api/src/db/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/test/**"],
      thresholds: {
        "packages/domain/src/**": { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
