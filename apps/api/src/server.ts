import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSmtpMailer } from "./lib/mailer.js";
import { createLogger } from "./logger.js";

/**
 * Production entry point. Everything that reads `process.env` or binds a port
 * happens here, so `buildApp()` stays testable.
 *
 * Graceful shutdown: SIGINT/SIGTERM trigger `app.close()` which runs the
 * Fastify `onClose` hooks (including `prisma.$disconnect`) before exiting.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const mailer = createSmtpMailer({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    from: config.SMTP_FROM,
  });
  const app = await buildApp({ config, logger, mailer });

  const close = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "shutdown error");
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));

  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info({ host: config.HOST, port: config.PORT }, "api listening");
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
