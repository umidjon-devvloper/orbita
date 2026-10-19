import type { Prisma } from "../../generated/prisma/client.js";

/**
 * One source of truth for audit rows. Writes are append-only at the DB level
 * (see triggers in the constraints migration — D-35), so this helper deliberately
 * exposes no update/delete API. If an audit entry is wrong, write a corrective
 * one, don't amend the old one.
 *
 * Takes a `Prisma.TransactionClient` so the audit row commits in the same
 * transaction as the business change — if the business change rolls back, the
 * audit does too, and if the audit fails the business write is also undone.
 * This is the only way to keep "every sensitive change has an audit row" an
 * invariant rather than a hopeful comment.
 */
export interface AuditInput {
  readonly orgId: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly requestId?: string | null;
  readonly ip?: string | null;
}

export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.before !== undefined ? { before: input.before as Prisma.InputJsonValue } : {}),
      ...(input.after !== undefined ? { after: input.after as Prisma.InputJsonValue } : {}),
      requestId: input.requestId ?? null,
      ip: input.ip ?? null,
    },
  });
}
