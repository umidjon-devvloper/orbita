import fp from "fastify-plugin";
import { createPrisma, type PrismaClient } from "../db/client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

interface PrismaPluginOptions {
  /** Reuse an existing client (tests). When omitted a new one is built from the URL. */
  client?: PrismaClient;
  /** Connection URL for the client this plugin creates. Ignored if `client` is given. */
  url?: string;
}

/**
 * Expose a single `PrismaClient` on the Fastify instance.
 *
 * Takes an explicit client when one is injected (integration tests, so the
 * test can roll back around the whole app lifecycle), otherwise builds one
 * from the supplied URL. Closing on `onClose` is skipped for injected
 * clients — the owner shuts them down.
 */
export const prismaPlugin = fp<PrismaPluginOptions>(
  (app, opts) => {
    const owned = opts.client === undefined;
    let client: PrismaClient;
    if (opts.client !== undefined) {
      client = opts.client;
    } else if (opts.url !== undefined) {
      client = createPrisma(opts.url);
    } else {
      throw new Error("prismaPlugin requires either a client or a url");
    }
    app.decorate("prisma", client);
    if (owned) {
      app.addHook("onClose", async () => {
        await client.$disconnect();
      });
    }
    return Promise.resolve();
  },
  { name: "prisma" },
);
