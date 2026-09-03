import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import type { TenantNotificationTables } from "./tenant-schema";
import { mailboxThreadingFromProviderId } from "./mailbox-thread";

export * from "./mailbox-thread";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export type MailboxDirection = "out" | "in";
export type MailboxOrigin = "automatic" | "campaign" | "test" | "manual";
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
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  rfcReferences?: string | null;
  threadId?: string | null;
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
      // Received is not Automatic/Campaigns/Failed. Origin stays in the row for storage only.
      keys.push("in");
      return keys;
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
    case "manual":
      keys.push("manual");
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
    rfcMessageId: letter.rfcMessageId ?? null,
    inReplyTo: letter.inReplyTo ?? null,
    rfcReferences: letter.rfcReferences ?? null,
    threadId: letter.threadId ?? null,
  };
}

/** Retry archive updates the snapshot body, never threading ids. */
export function mailboxRetryBodySet(
  letter: MailboxLetterInput,
  values: ReturnType<typeof mailboxInsertValues>,
) {
  return {
    fromEmail: letter.fromEmail,
    fromName: letter.fromName,
    toEmail: letter.toEmail,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    direction: values.direction,
    origin: letter.origin,
    updatedAt: Date.now(),
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
      set: mailboxRetryBodySet(letter, values),
    });
}

export async function attachMailboxSendIds(
  db: Db,
  tables: TenantNotificationTables,
  input: { outboxId: bigint; providerMessageId: string },
): Promise<void> {
  const { rfcMessageId, threadId } = mailboxThreadingFromProviderId(input.providerMessageId);
  await db
    .update(tables.emailMailbox)
    .set({ rfcMessageId, threadId, updatedAt: Date.now() })
    .where(eq(tables.emailMailbox.outboxId, input.outboxId));
}
