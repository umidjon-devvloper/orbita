import { z } from "zod";

const LogLevel = z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().default("Asia/Tashkent"),
  APP_URL: z.string().default("http://localhost:3000"),
  API_URL: z.string().default("http://localhost:4000"),
  BRAND_NAME: z.string().min(1).default("Orbita"),
  DEFAULT_LOCALE: z.enum(["uz", "ru", "en"]).default("uz"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().optional(),
  SESSION_SECRET: z.string().min(16).default("development-secret-change-me-please-xx"),
  LOG_LEVEL: LogLevel.default("info"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
});

export type Config = z.infer<typeof Schema>;

/**
 * Parse a raw env object into a validated Config. Called once at process start.
 * Throws with every failing key reported together — never continues on partial input.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
