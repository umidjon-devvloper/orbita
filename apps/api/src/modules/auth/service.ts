import type { PrismaClient } from "../../db/client.js";
import { OrbitaError } from "../../errors.js";
import type { Mailer } from "../../lib/mailer.js";
import { hashPassword, needsRehash, verifyPassword } from "../../lib/password.js";
import type { RateLimit } from "../../lib/rate-limit.js";
import { newSession, SESSION } from "../../lib/session.js";
import { randomToken, sha256Hex } from "../../lib/tokens.js";

/**
 * Account lockout policy — matches `User.failedLogins` / `User.lockedUntil`
 * in the schema. Five misses in a row lock the account for 15 minutes; a
 * successful login clears the counter. Separate from the per-IP+email
 * rate limit, which stops guessers before they even reach the DB.
 */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;
const RESET_TOKEN_TTL_MS = 30 * 60_000;

export interface AuthContext {
  readonly prisma: PrismaClient;
  readonly mailer: Mailer;
  readonly loginLimit: RateLimit;
  readonly resetLimit: RateLimit;
  readonly now: () => Date;
  readonly brandName: string;
  readonly appUrl: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface LoginResult {
  readonly cookieToken: string;
  readonly csrfToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly orgId: string;
    readonly locale: string;
    readonly theme: string;
  };
}

/**
 * Attempt to sign in. Deliberately uniform error for both bad email and bad
 * password (`orbita:auth:invalid_credentials`) so that account existence
 * does not leak. Separate codes for locked and rate-limited so the UI can
 * tell the user when to come back.
 */
export async function login(ctx: AuthContext, input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const rlKey = `${input.ip ?? "-"}|${email}`;
  if (!ctx.loginLimit.hit(rlKey, ctx.now())) {
    throw new OrbitaError({
      code: "orbita:auth:rate_limited",
      status: 429,
      title: "Too many sign-in attempts",
    });
  }

  const now = ctx.now();
  const user = await ctx.prisma.user.findFirst({ where: { email } });

  if (user === null || user.passwordHash === null || user.status !== "ACTIVE") {
    // Argon2 verify is slow by design; emulate the delay to keep the
    // "wrong password" and "unknown email" paths indistinguishable in time.
    await verifyPassword(await getDummyHash(), input.password);
    throw invalidCreds();
  }

  if (user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime()) {
    throw new OrbitaError({
      code: "orbita:auth:locked",
      status: 423,
      title: "Account temporarily locked",
      detail: `Try again after ${user.lockedUntil.toISOString()}`,
    });
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const locked = failed >= MAX_FAILED_LOGINS;
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: locked ? 0 : failed,
        lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : null,
      },
    });
    throw invalidCreds();
  }

  // Successful auth — reset the counter, rotate the hash if parameters
  // have been bumped, and open a fresh session.
  const session = newSession(now);
  await ctx.prisma.$transaction([
    ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    }),
    ctx.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: session.tokenHash,
        csrfToken: session.csrfToken,
        idleExpires: session.idleExpires,
        absExpires: session.absExpires,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    }),
  ]);
  ctx.loginLimit.reset(rlKey);

  return {
    cookieToken: session.token,
    csrfToken: session.csrfToken,
    user: {
      id: user.id,
      email: user.email,
      orgId: user.orgId,
      locale: user.locale,
      theme: user.theme,
    },
  };
}

/** Delete the session row keyed by its hashed cookie token. Idempotent — no error if already gone. */
export async function logout(ctx: AuthContext, rawCookieToken: string): Promise<void> {
  await ctx.prisma.session.deleteMany({ where: { tokenHash: sha256Hex(rawCookieToken) } });
}

export interface RequestResetInput {
  readonly email: string;
  readonly ip?: string | undefined;
}

/**
 * Password reset request. The response is identical whether or not the
 * email exists; the caller cannot tell. Rate-limited per email so an
 * attacker cannot grind through an address list.
 */
export async function requestPasswordReset(ctx: AuthContext, input: RequestResetInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!ctx.resetLimit.hit(email, ctx.now())) {
    // Still return success — do not reveal that a limit was hit.
    return;
  }
  const user = await ctx.prisma.user.findFirst({ where: { email } });
  if (user === null || user.status !== "ACTIVE") return;

  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(ctx.now().getTime() + RESET_TOKEN_TTL_MS);
  await ctx.prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const link = `${ctx.appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await ctx.mailer.send({
    to: user.email,
    subject: `${ctx.brandName} — parolni tiklash`,
    text:
      `Siz ${ctx.brandName} hisobingiz uchun parolni tiklashni so'radingiz.\n\n` +
      `Yangi parol belgilash havolasi (30 daqiqa amal qiladi):\n${link}\n\n` +
      `Agar bu siz bo'lmasangiz, bu xabarni e'tiborsiz qoldiring.\n`,
  });
}

export interface ConfirmResetInput {
  readonly token: string;
  readonly newPassword: string;
}

/**
 * Confirm a password reset. Single-use: the token is marked used in the
 * same transaction that updates the password hash. All existing sessions
 * for the user are revoked so a thief who happened to have one at the
 * time of reset loses access.
 */
export async function confirmPasswordReset(ctx: AuthContext, input: ConfirmResetInput): Promise<void> {
  const now = ctx.now();
  const tokenHash = sha256Hex(input.token);
  const token = await ctx.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (token === null || token.usedAt !== null || token.expiresAt.getTime() < now.getTime()) {
    throw new OrbitaError({
      code: "orbita:auth:invalid_reset_token",
      status: 400,
      title: "Reset link is invalid or expired",
    });
  }
  const hash = await hashPassword(input.newPassword);
  await ctx.prisma.$transaction([
    ctx.prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: now } }),
    ctx.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: hash, failedLogins: 0, lockedUntil: null },
    }),
    ctx.prisma.session.deleteMany({ where: { userId: token.userId } }),
  ]);
}

export const SESSION_COOKIE = SESSION.COOKIE_NAME;

// --- Internals ---------------------------------------------------------------

function invalidCreds(): OrbitaError {
  return new OrbitaError({
    code: "orbita:auth:invalid_credentials",
    status: 401,
    title: "Email or password is incorrect",
  });
}

/**
 * A throw-away hash used only to burn Argon2 time on the "unknown email"
 * path so attackers cannot distinguish paths by latency. Hashed lazily on
 * first miss, then cached — the random body is never verified against any
 * input the user controls.
 */
let dummyHashCache: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashCache ??= hashPassword(`orbita-not-a-real-password-${randomToken(16)}`);
  return dummyHashCache;
}
