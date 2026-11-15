import { makePublicId } from "@foundry/database";
import { MailboxInboundError, ingestInboundLetter, parseMailboxEml, type ParsedInboundLetter, type StoredAttachment } from "@relay/engine";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { emailMailbox, mailboxInboundFailure, notificationTables, tenants } from "@/db/schema";
import { tenantForInbox } from "@/lib/mailbox/inbound-recipient";
import { inboundAttachmentKey, mailBucket, safeFilename, type MailBucket } from "@/lib/mailbox/mail-bucket";

export const queuedInboundSchema = z.object({
  rawId: z.string().min(1),
  rawKey: z.string().min(1),
  envelopeFrom: z.string(),
  envelopeTo: z.string().min(1),
  authResults: z.string().nullable(),
  receivedAt: z.number(),
});

export type QueuedInbound = z.infer<typeof queuedInboundSchema>;

type Outcome = "inserted" | "duplicate" | "failed";

export const MAX_ROUTED_LETTER_BYTES = 26_214_400;

// Null when the letter is over the cap; checks the R2 size before reading the body and the bytes after.
async function readRaw(bucket: MailBucket, key: string): Promise<ArrayBuffer | null> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`Raw mail missing: ${key}`);
  if (object.size > MAX_ROUTED_LETTER_BYTES) return null;
  const bytes = await new Response(object.body).arrayBuffer();
  return bytes.byteLength > MAX_ROUTED_LETTER_BYTES ? null : bytes;
}

export async function processQueuedInbound(msg: QueuedInbound): Promise<{ outcome: Outcome }> {
  const bucket = mailBucket();
  const recipientTenantId = await tenantForInbox(msg.envelopeTo);
  const bytes = await readRaw(bucket, msg.rawKey);
  if (bytes == null) return failed(msg, "Letter too large", recipientTenantId);
  if (recipientTenantId == null) return failed(msg, "No such mailbox", null);

  let parsed: ParsedInboundLetter;
  try {
    parsed = await parseMailboxEml(bytes);
  } catch (err) {
    if (err instanceof MailboxInboundError) return failed(msg, err.message, recipientTenantId);
    throw err;
  }

  const attachments: StoredAttachment[] = [];
  for (const [position, file] of (parsed.attachments ?? []).entries()) {
    const storageKey = inboundAttachmentKey(msg.rawId, position, file.filename ?? "");
    await bucket.put(storageKey, file.content);
    attachments.push({
      publicId: makePublicId("att")(),
      position,
      filename: safeFilename(file.filename),
      contentType: file.mimeType,
      sizeBytes: file.content.byteLength,
      contentId: file.contentId,
      storageKey,
    });
  }

  const result = await db.transaction(async (tx) => {
    const stored = await ingestInboundLetter(tx, notificationTables, parsed, {
      recipientTenantId,
      rawKey: msg.rawKey,
      authResults: msg.authResults,
      receivedAt: msg.receivedAt,
      attachments,
    });
    await tx.delete(mailboxInboundFailure).where(eq(mailboxInboundFailure.rawKey, msg.rawKey));
    return stored;
  });

  if (result.status === "duplicate" && result.existingRawKey !== msg.rawKey) {
    const { objects } = await bucket.list({ prefix: `mail/att/${msg.rawId}/` });
    await bucket.delete([msg.rawKey, ...objects.map((o) => o.key)]);
  }
  return { outcome: result.status };
}

async function failed(msg: QueuedInbound, error: string, tenantId: bigint | null): Promise<{ outcome: "failed" }> {
  await recordInboundFailure(msg, { error, attempts: 1, tenantId });
  return { outcome: "failed" };
}

export async function recordInboundFailure(
  msg: QueuedInbound,
  opts: { error: string | null; attempts: number; tenantId: bigint | null },
): Promise<void> {
  const [committed] = await db
    .select({ id: emailMailbox.id })
    .from(emailMailbox)
    .where(eq(emailMailbox.rawKey, msg.rawKey))
    .limit(1);
  if (committed) return;
  const [tenant] =
    opts.tenantId == null
      ? []
      : await db.select({ organizationId: tenants.organizationId }).from(tenants).where(eq(tenants.id, opts.tenantId)).limit(1);
  await db
    .insert(mailboxInboundFailure)
    .values({
      rawKey: msg.rawKey,
      envelopeFrom: msg.envelopeFrom,
      envelopeTo: msg.envelopeTo,
      authResults: msg.authResults,
      receivedAt: msg.receivedAt,
      error: opts.error,
      attempts: opts.attempts,
      tenantId: opts.tenantId,
      organizationId: tenant?.organizationId ?? null,
    })
    .onConflictDoUpdate({
      target: mailboxInboundFailure.rawKey,
      set: {
        attempts: sql`greatest(${mailboxInboundFailure.attempts} + 1, ${opts.attempts})`,
        error: sql`coalesce(excluded.error, ${mailboxInboundFailure.error})`,
      },
    });
}
