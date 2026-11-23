import { and, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import type { MailboxAccess } from "@/lib/mailbox/access";

// Members limited by mailbox grants see only email sends whose letter sits in a granted mailbox;
// SMS/WhatsApp/in-app sends have no mailbox, so only full-access members (mailbox:manage) see them.
export async function listSends(scope: { tenantIds: bigint[]; includeOperatorMail: boolean; mailboxIds: MailboxAccess }) {
  if (scope.tenantIds.length === 0) return [];
  if (scope.mailboxIds !== "all" && scope.mailboxIds.length === 0) return [];
  const o = notificationTables.notificationOutbox;
  const m = notificationTables.emailMailbox;
  const clauses = [inArray(o.tenantId, scope.tenantIds)];
  if (scope.includeOperatorMail) clauses.push(isNull(o.tenantId));
  const granted =
    scope.mailboxIds === "all"
      ? undefined
      : sql`exists (select 1 from ${m} where ${m.outboxId} = ${o.id} and ${inArray(m.mailboxId, scope.mailboxIds)})`;
  return db
    .select({
      publicId: o.publicId,
      status: o.status,
      channel: o.channel,
      kind: o.kind,
      event: o.event,
      recipientEmail: o.recipientEmail,
      recipientPhone: o.recipientPhone,
      recipientExternalId: o.recipientExternalId,
      attempts: o.attempts,
      lastError: o.lastError,
    })
    .from(o)
    .where(and(or(...clauses), granted))
    .orderBy(desc(o.createdAt))
    .limit(100);
}
