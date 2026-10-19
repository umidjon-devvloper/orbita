import pino, { type Logger, type LoggerOptions } from "pino";
import type { Config } from "./config.js";

/**
 * Build the root pino logger. Pretty output in development; JSON in test and
 * production so logs are machine-readable and ship cleanly to any aggregator.
 *
 * Redaction removes authorization headers, cookies and session fields before
 * they can reach disk; add new sensitive keys here, not at call sites.
 */
export function createLogger(config: Config): Logger {
  const base: LoggerOptions = {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-csrf-token']",
        "res.headers['set-cookie']",
        "password",
        "token",
        "sessionId",
      ],
      censor: "[redacted]",
      remove: false,
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    base: { env: config.NODE_ENV },
  };
  // Silence the logger during tests. A developer who wants to see output can
  // call createLogger with LOG_LEVEL overridden to any non-silent value.
  if (config.NODE_ENV === "test" && config.LOG_LEVEL === "info") {
    return pino({ ...base, level: "silent" });
  }
  return pino(base);
}
