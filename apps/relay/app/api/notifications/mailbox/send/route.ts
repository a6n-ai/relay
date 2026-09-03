import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { archiveMailboxLetter, generateRelayMessageId, replyThreading } from "@relay/engine";
import { z } from "zod";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { operatorGuard } from "@/lib/campaigns/http";
import { operatorDefaultFrom } from "@/lib/email/from-address";
import { getEmailProvider, hydrateSmtpFromDb } from "@/lib/email/provider";
import { readMailboxLetter } from "@/lib/mailbox/list";
import { conversationKey } from "@/lib/mailbox/listing";
import { manualMailboxLetter } from "@/lib/mailbox/manual-send";
import { emailSendersService } from "@/lib/services/email-senders.service";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().trim().min(1),
  text: z.string().trim().min(1),
  fromId: z.string().trim().min(1),
  replyToId: z.string().trim().min(1).optional(),
});

export const POST = handler(async (req: Request) => {
  await operatorGuard();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  let tenantId: bigint | null = null;
  let from: { email: string; name?: string } | null = null;
  if (parsed.data.fromId === "operator") {
    from = await operatorDefaultFrom();
  } else {
    const sender = await emailSendersService.read(parsed.data.fromId).catch(() => null);
    if (!sender || sender.verifiedAt == null) throw new ValidationError("Unknown From");
    tenantId = sender.tenantId;
    from = { email: sender.email, name: sender.displayName ?? undefined };
  }
  if (!from?.email) throw new ValidationError("Set a From address under Email sending first");

  let reply: { inReplyTo: string; rfcReferences: string; threadId: string } | null = null;
  if (parsed.data.replyToId) {
    const parent = await readMailboxLetter(parsed.data.replyToId);
    if (!parent) throw new ValidationError("Unknown letter");
    if (parent.tenantId != null) tenantId = parent.tenantId;
    reply = replyThreading({
      rfcMessageId: parent.rfcMessageId,
      threadId: parent.threadId?.trim() || conversationKey(parent),
      rfcReferences: parent.rfcReferences,
    });
    if (!reply) throw new ValidationError("This letter cannot start a reply yet");
  }

  const rfcMessageId = generateRelayMessageId();
  const letter = manualMailboxLetter({
    tenantId,
    fromEmail: from.email,
    fromName: from.name ?? null,
    toEmail: parsed.data.to,
    subject: parsed.data.subject,
    text: parsed.data.text,
    providerMessageId: rfcMessageId,
    ...(reply
      ? {
          inReplyTo: reply.inReplyTo,
          rfcReferences: reply.rfcReferences,
          threadId: reply.threadId,
        }
      : {}),
  });
  await hydrateSmtpFromDb();
  await getEmailProvider().send({
    to: { email: parsed.data.to },
    subject: parsed.data.subject,
    html: letter.html,
    text: parsed.data.text,
    from,
    rfcMessageId,
    ...(reply
      ? { inReplyTo: reply.inReplyTo, rfcReferences: reply.rfcReferences }
      : {}),
  });
  await archiveMailboxLetter(db, notificationTables, letter);
  return json({ ok: true });
});
