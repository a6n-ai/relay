import { desc, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";

export async function listSends(scope: { tenantIds: bigint[]; includeOperatorMail: boolean }) {
  if (scope.tenantIds.length === 0) return [];
  const o = notificationTables.notificationOutbox;
  const clauses = [inArray(o.tenantId, scope.tenantIds)];
  if (scope.includeOperatorMail) clauses.push(isNull(o.tenantId));
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
    .where(or(...clauses))
    .orderBy(desc(o.createdAt))
    .limit(100);
}
