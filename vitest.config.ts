import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
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
