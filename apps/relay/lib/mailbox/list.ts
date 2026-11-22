import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { emailMailbox, notificationOutbox, tenantMailboxes, tenants } from "@/db/schema";
import type { MailboxScope } from "./scope";

const listColumns = {
  id: emailMailbox.id,
  publicId: emailMailbox.publicId,
  sentAt: emailMailbox.sentAt,
  subject: emailMailbox.subject,
  fromEmail: emailMailbox.fromEmail,
  fromName: emailMailbox.fromName,
  toEmail: emailMailbox.toEmail,
  createdAt: emailMailbox.createdAt,
  tenantId: emailMailbox.tenantId,
  tenantPublicId: tenants.publicId,
  tenantName: tenants.name,
  status: notificationOutbox.status,
  direction: emailMailbox.direction,
  origin: emailMailbox.origin,
  threadId: emailMailbox.threadId,
  rfcMessageId: emailMailbox.rfcMessageId,
  inReplyTo: emailMailbox.inReplyTo,
  rfcReferences: emailMailbox.rfcReferences,
};

function scopeFilter(scope: MailboxScope, tenantId?: bigint): SQL | null {
  if (scope.mailboxIds !== "all" && scope.mailboxIds.length === 0) return null;
  let tenantWhere: SQL | null;
  if (tenantId != null) {
    tenantWhere = scope.tenantIds.includes(tenantId) ? eq(emailMailbox.tenantId, tenantId) : null;
  } else {
    const clauses: SQL[] = [];
    if (scope.tenantIds.length > 0) clauses.push(inArray(emailMailbox.tenantId, scope.tenantIds));
    if (scope.includeOperatorMail && scope.mailboxIds === "all") clauses.push(isNull(emailMailbox.tenantId));
    tenantWhere = clauses.length > 0 ? (or(...clauses) ?? null) : null;
  }
  if (!tenantWhere || scope.mailboxIds === "all") return tenantWhere;
  return and(tenantWhere, inArray(emailMailbox.mailboxId, scope.mailboxIds)) ?? null;
}

export async function listMailboxLetters(
  scope: MailboxScope,
  opts?: { limit?: number; tenantId?: bigint },
) {
  const where = scopeFilter(scope, opts?.tenantId);
  if (!where) return [];
  return db
    .select({ ...listColumns, mailboxPublicId: tenantMailboxes.publicId })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .leftJoin(tenantMailboxes, eq(emailMailbox.mailboxId, tenantMailboxes.id))
    .where(where)
    .orderBy(desc(emailMailbox.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function listMailboxThread(scope: MailboxScope, threadId: string) {
  const where = scopeFilter(scope);
  if (!where) return [];
  return db
    .select({
      ...listColumns,
      html: emailMailbox.html,
      text: emailMailbox.text,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .where(and(eq(emailMailbox.threadId, threadId), where))
    .orderBy(emailMailbox.createdAt);
}

export async function readMailboxLetter(scope: MailboxScope, publicId: string) {
  const where = scopeFilter(scope);
  if (!where) return null;
  const [row] = await db
    .select({
      ...listColumns,
      html: emailMailbox.html,
      text: emailMailbox.text,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .where(and(eq(emailMailbox.publicId, publicId), where))
    .limit(1);
  return row ?? null;
}
