import { desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxInboundFailure } from "@/db/schema";
import { processQueuedInbound, type QueuedInbound } from "./process-queued";
import type { MailboxScope } from "./scope";

function visible(row: { organizationId: string | null }, scope: MailboxScope): boolean {
  return row.organizationId === null ? scope.includeOperatorMail : row.organizationId === scope.organizationId;
}

export async function listInboundFailures(scope: MailboxScope) {
  const org = eq(mailboxInboundFailure.organizationId, scope.organizationId);
  return db
    .select({
      publicId: mailboxInboundFailure.publicId,
      envelopeFrom: mailboxInboundFailure.envelopeFrom,
      envelopeTo: mailboxInboundFailure.envelopeTo,
      receivedAt: mailboxInboundFailure.receivedAt,
      error: mailboxInboundFailure.error,
      attempts: mailboxInboundFailure.attempts,
    })
    .from(mailboxInboundFailure)
    .where(scope.includeOperatorMail ? or(org, isNull(mailboxInboundFailure.organizationId)) : org)
    .orderBy(desc(mailboxInboundFailure.createdAt))
    .limit(100);
}

export async function readInboundFailure(scope: MailboxScope, publicId: string) {
  const [row] = await db
    .select()
    .from(mailboxInboundFailure)
    .where(eq(mailboxInboundFailure.publicId, publicId))
    .limit(1);
  return row && visible(row, scope) ? row : null;
}

export async function retryInboundFailure(
  scope: MailboxScope,
  publicId: string,
): Promise<{ outcome: "inserted" | "duplicate" | "failed" } | null> {
  const row = await readInboundFailure(scope, publicId);
  if (!row) return null;
  const msg: QueuedInbound = {
    rawId: row.rawKey.split("/").pop()?.replace(/\.eml$/, "") ?? "",
    rawKey: row.rawKey,
    envelopeFrom: row.envelopeFrom,
    envelopeTo: row.envelopeTo,
    authResults: row.authResults,
    receivedAt: row.receivedAt,
  };
  const { outcome } = await processQueuedInbound(msg);
  if (outcome !== "failed") await db.delete(mailboxInboundFailure).where(eq(mailboxInboundFailure.id, row.id));
  return { outcome };
}
