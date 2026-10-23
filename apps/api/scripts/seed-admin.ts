import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { createPrisma } from "../src/db/client.js";
import { hashPassword } from "../src/lib/password.js";
import { seedDefaultRoles } from "../src/modules/authz/role-seed.js";

/**
 * One-shot admin seeder.
 *
 * Reads SEED_EMAIL / SEED_PASSWORD / SEED_ORG_NAME from the env (with
 * sensible defaults), creates the organization + default roles + the
 * admin user with an Argon2id-hashed password, and prints the login
 * credentials to stdout. Idempotent on email: reruns update the
 * password instead of failing on the unique index.
 *
 * Not meant for production — use the Users admin UI once an admin
 * exists. Kept out of the build.
 */
async function main() {
  const config = loadConfig();
  const prisma = createPrisma(config.DATABASE_URL);
  const email = (process.env.SEED_EMAIL ?? "admin@orbita.local").trim().toLowerCase();
  const password = process.env.SEED_PASSWORD ?? "orbita-admin-change-me";
  const orgName = process.env.SEED_ORG_NAME ?? "Orbita Demo";

  if (password.length < 10) {
    throw new Error("SEED_PASSWORD must be at least 10 characters");
  }

  const org = await prisma.organization.upsert({
    where: { id: await resolveOrgId(prisma, orgName) },
    update: {},
    create: { name: orgName },
  });

  const roles = await seedDefaultRoles(prisma, org.id);
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { passwordHash, status: "ACTIVE", failedLogins: 0, lockedUntil: null },
    create: { orgId: org.id, email, passwordHash, locale: "uz" },
  });

  const existingAssignment = await prisma.roleAssignment.findFirst({
    where: { userId: user.id, roleId: roles.admin, orgUnitId: null },
  });
  if (existingAssignment === null) {
    await prisma.roleAssignment.create({
      data: { userId: user.id, roleId: roles.admin, orgUnitId: null },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    [
      "Admin ready.",
      `  Organization: ${org.name} (${org.id})`,
      `  Email:        ${email}`,
      `  Password:     ${password}`,
      "",
      "Open http://127.0.0.1:3000/uz/login and sign in.",
    ].join("\n"),
  );
  await prisma.$disconnect();
}

/** Prisma upsert needs a where unique; we don't have (orgName) unique, so fall back to the org row's id if any. */
async function resolveOrgId(
  prisma: ReturnType<typeof createPrisma>,
  name: string,
): Promise<string> {
  const existing = await prisma.organization.findFirst({ where: { name }, select: { id: true } });
  return existing?.id ?? "00000000-0000-0000-0000-000000000000";
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
