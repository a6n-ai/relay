import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { TenantNotificationTables } from "./tenant-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export type MailboxLetterInput = {
  outboxId: bigint | null;
  tenantId: bigint | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
};

/** Snapshot the letter we are about to send so the mailbox is not a later re-render. */
export async function archiveMailboxLetter(
  db: Db,
  tables: TenantNotificationTables,
  letter: MailboxLetterInput,
): Promise<void> {
  const values = {
    tenantId: letter.tenantId,
    outboxId: letter.outboxId,
    fromEmail: letter.fromEmail,
    fromName: letter.fromName,
    toEmail: letter.toEmail,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
  };
  if (letter.outboxId == null) {
    await db.insert(tables.emailMailbox).values(values);
    return;
  }
  await db
    .insert(tables.emailMailbox)
    .values(values)
    .onConflictDoUpdate({
      target: tables.emailMailbox.outboxId,
      set: {
        fromEmail: letter.fromEmail,
        fromName: letter.fromName,
        toEmail: letter.toEmail,
        subject: letter.subject,
        html: letter.html,
        text: letter.text,
        updatedAt: Date.now(),
      },
    });
}
