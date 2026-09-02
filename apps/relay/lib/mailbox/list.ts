import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { emailMailbox, notificationOutbox, tenants } from "@/db/schema";

export async function listMailboxLetters(limit = 100) {
  return db
    .select({
      publicId: emailMailbox.publicId,
      subject: emailMailbox.subject,
      fromEmail: emailMailbox.fromEmail,
      fromName: emailMailbox.fromName,
      toEmail: emailMailbox.toEmail,
      createdAt: emailMailbox.createdAt,
      tenantName: tenants.name,
      status: notificationOutbox.status,
      direction: emailMailbox.direction,
      origin: emailMailbox.origin,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .orderBy(desc(emailMailbox.createdAt))
    .limit(limit);
}

export async function readMailboxLetter(publicId: string) {
  const [row] = await db
    .select({
      publicId: emailMailbox.publicId,
      subject: emailMailbox.subject,
      fromEmail: emailMailbox.fromEmail,
      fromName: emailMailbox.fromName,
      toEmail: emailMailbox.toEmail,
      html: emailMailbox.html,
      text: emailMailbox.text,
      createdAt: emailMailbox.createdAt,
      tenantName: tenants.name,
      status: notificationOutbox.status,
    })
    .from(emailMailbox)
    .leftJoin(notificationOutbox, eq(emailMailbox.outboxId, notificationOutbox.id))
    .leftJoin(tenants, eq(emailMailbox.tenantId, tenants.id))
    .where(eq(emailMailbox.publicId, publicId))
    .limit(1);
  return row ?? null;
}
