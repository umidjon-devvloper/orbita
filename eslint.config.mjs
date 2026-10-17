import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const NODE_BUILTINS = [
  "fs",
  "path",
  "os",
  "child_process",
  "net",
  "http",
  "https",
  "crypto",
  "worker_threads",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.next/**",
      "docs/**",
      "apps/api/src/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": "error",
    },
  },
  {
    // packages/domain must stay pure: no I/O, no frameworks, no floats for money/scores.
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: NODE_BUILTINS.flatMap((m) => [m, `node:${m}`]).map((name) => ({
            name,
            message: "packages/domain is pure: no I/O.",
          })),
          patterns: [
            {
              group: ["@prisma/*", "fastify*", "next*", "react*", "@orbita/api*", "@orbita/web*"],
              message: "packages/domain must not depend on frameworks or apps.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name=/^(round|floor|ceil)$/]",
          message: "Use bigint helpers from money/ and score/ — no float rounding in domain.",
        },
        { selector: "CallExpression[callee.name='parseFloat']", message: "No floats in domain." },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  { files: ["**/*.mjs", "**/*.js"], ...tseslint.configs.disableTypeChecked },
  { files: ["apps/*/scripts/**/*.mjs"], rules: { "no-console": "off" } },
);
