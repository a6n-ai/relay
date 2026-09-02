import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { TenantNotificationTables } from "./tenant-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export type MailboxDirection = "out" | "in";
export type MailboxOrigin = "automatic" | "campaign" | "test";
export type MailboxOutboxStatus = "pending" | "processing" | "sent" | "failed" | null;

export type MailboxLetterInput = {
  outboxId: bigint | null;
  tenantId: bigint | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  direction?: MailboxDirection;
  origin: MailboxOrigin;
};

/** Campaign queue rows are operator-confirmed blasts; everything else is Automatic. */
export function mailboxOriginFromCampaignId(campaignId: bigint | null | undefined): MailboxOrigin {
  return campaignId == null ? "automatic" : "campaign";
}

/** Chip ids for the mailbox listing. Missing outbox is treated as sent (not failed). */
export function letterFilterKeys(input: {
  direction: MailboxDirection;
  origin: MailboxOrigin;
  outboxStatus: MailboxOutboxStatus;
}): string[] {
  const keys: string[] = [];
  switch (input.direction) {
    case "out":
      keys.push("out");
      break;
    case "in":
      keys.push("in");
      break;
    default: {
      const _exhaustive: never = input.direction;
      return _exhaustive;
    }
  }
  switch (input.origin) {
    case "automatic":
      keys.push("automatic");
      break;
    case "campaign":
      keys.push("campaign");
      break;
    case "test":
      keys.push("test");
      break;
    default: {
      const _exhaustive: never = input.origin;
      return _exhaustive;
    }
  }
  if (input.outboxStatus === "failed") keys.push("failed");
  return keys;
}

export function mailboxInsertValues(letter: MailboxLetterInput) {
  return {
    tenantId: letter.tenantId,
    outboxId: letter.outboxId,
    fromEmail: letter.fromEmail,
    fromName: letter.fromName,
    toEmail: letter.toEmail,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    direction: letter.direction ?? "out",
    origin: letter.origin,
  };
}

/** Snapshot the letter we are about to send so the mailbox is not a later re-render. */
export async function archiveMailboxLetter(
  db: Db,
  tables: TenantNotificationTables,
  letter: MailboxLetterInput,
): Promise<void> {
  const values = mailboxInsertValues(letter);
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
        direction: values.direction,
        origin: letter.origin,
        updatedAt: Date.now(),
      },
    });
}
