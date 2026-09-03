import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { emailMailbox, notificationOutbox, tenants } from "@/db/schema";

const listColumns = {
  publicId: emailMailbox.publicId,
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

export async function listMailboxLetters(limit = 100) {
  return db
    .select(listColumns)
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .orderBy(desc(emailMailbox.createdAt))
    .limit(limit);
}

export async function listMailboxThread(threadId: string) {
  return db
    .select({
      ...listColumns,
      html: emailMailbox.html,
      text: emailMailbox.text,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .where(eq(emailMailbox.threadId, threadId))
    .orderBy(emailMailbox.createdAt);
}

export async function readMailboxLetter(publicId: string) {
  const [row] = await db
    .select({
      ...listColumns,
      html: emailMailbox.html,
      text: emailMailbox.text,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .where(eq(emailMailbox.publicId, publicId))
    .limit(1);
  return row ?? null;
}
