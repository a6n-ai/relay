import { count, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxInboundFailure } from "@/db/schema";
import { processQueuedInbound, type QueuedInbound } from "./process-queued";
import type { MailboxScope } from "./scope";

function visible(row: { organizationId: string | null }, scope: MailboxScope): boolean {
  return row.organizationId === null ? scope.includeOperatorMail : row.organizationId === scope.organizationId;
}

function scopeCondition(scope: MailboxScope) {
  const org = eq(mailboxInboundFailure.organizationId, scope.organizationId);
  return scope.includeOperatorMail ? or(org, isNull(mailboxInboundFailure.organizationId)) : org;
}

export async function countInboundFailures(scope: MailboxScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(mailboxInboundFailure).where(scopeCondition(scope));
  return row?.n ?? 0;
}

export async function listInboundFailures(scope: MailboxScope) {
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
    .where(scopeCondition(scope))
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
  const rawId = row.rawKey.split("/").pop()?.replace(/\.eml$/, "");
  if (!rawId) throw new Error(`Inbound failure ${publicId} has no raw key basename`);
  const msg: QueuedInbound = {
    rawId,
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
