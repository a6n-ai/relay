import { makePublicId } from "@foundry/database";
import { MailboxInboundError, ingestInboundLetter, parseMailboxEml, type ParsedInboundLetter, type StoredAttachment } from "@relay/engine";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { mailboxInboundFailure, notificationTables, tenants } from "@/db/schema";
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

async function readRaw(bucket: MailBucket, key: string): Promise<ArrayBuffer> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`Raw mail missing: ${key}`);
  return new Response(object.body).arrayBuffer();
}

export async function processQueuedInbound(msg: QueuedInbound): Promise<{ outcome: Outcome }> {
  const bucket = mailBucket();
  const bytes = await readRaw(bucket, msg.rawKey);
  const recipientTenantId = await tenantForInbox(msg.envelopeTo);
  if (recipientTenantId == null) return failed(msg, "No such mailbox");

  let parsed: ParsedInboundLetter;
  try {
    parsed = await parseMailboxEml(bytes);
  } catch (err) {
    if (err instanceof MailboxInboundError) return failed(msg, err.message);
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

async function failed(msg: QueuedInbound, error: string): Promise<{ outcome: "failed" }> {
  await recordInboundFailure(msg, { error, attempts: 1 });
  return { outcome: "failed" };
}

export async function recordInboundFailure(
  msg: QueuedInbound,
  opts: { error: string | null; attempts: number },
): Promise<void> {
  const tenantId = await tenantForInbox(msg.envelopeTo);
  const [tenant] =
    tenantId == null
      ? []
      : await db.select({ organizationId: tenants.organizationId }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
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
      tenantId,
      organizationId: tenant?.organizationId ?? null,
    })
    .onConflictDoNothing({ target: mailboxInboundFailure.rawKey });
}
