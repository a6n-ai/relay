import MessageValidator from "sns-validator";
import { createLogger } from "@foundry/commons/logger";
import { parseSnsEnvelope, sesSuppressionsFromEvent } from "@/lib/notifications/ses-events";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";
import { enqueueTenantWebhooks } from "@/lib/webhooks/enqueue";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { notificationOutbox } from "@/db/schema";

export const runtime = "nodejs";

const log = createLogger("ses-webhook");
const validator = new MessageValidator();

interface SnsEnvelope {
  Type: string;
  TopicArn?: string;
  Message: string;
}

function verify(msg: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(msg as Record<string, unknown>, (err) => (err ? reject(err) : resolve()));
  });
}

export async function processSesEvent(messageJson: string): Promise<void> {
  const event = JSON.parse(messageJson) as Parameters<typeof sesSuppressionsFromEvent>[0] & {
    mail?: { messageId?: string };
  };
  const rows = sesSuppressionsFromEvent(event);
  if (rows.length === 0) return;
  const type = event.eventType ?? event.notificationType;
  const webhookEvent = type === "Complaint" ? "message.complained" : "message.bounced";
  // Only the app that sent the message hears about it; other apps never see its recipients.
  const messageId = event.mail?.messageId;
  const [sender] = messageId
    ? await db
        .select({ tenantId: notificationOutbox.tenantId })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.providerMessageId, messageId))
        .limit(1)
    : [];
  if (!sender) log.warn({ messageId, type }, "SES event has no matching send; no webhook sent");
  for (const row of rows) {
    // Suppression stays global: Relay is one sender to SES, so its reputation is shared.
    await suppressEmailRecipient(row.email, row.reason);
    if (sender) await enqueueTenantWebhooks(sender.tenantId, webhookEvent, { email: row.email, reason: row.reason });
  }
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const parsed = parseSnsEnvelope(raw);
  if (!parsed) {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  const msg: SnsEnvelope = parsed;
  // A valid SNS signature only proves AWS signed it; the topic proves it is ours.
  const expected = process.env.SES_FEEDBACK_TOPIC_ARN;
  if (!expected) {
    return Response.json({ title: "SES events are not configured", status: 503 }, { status: 503 });
  }
  const signed = JSON.parse(raw) as Record<string, unknown>;
  try {
    await verify(signed);
  } catch (err) {
    log.error({ err }, "SNS signature verification failed");
    return Response.json({ title: "Invalid signature", status: 403 }, { status: 403 });
  }
  if (msg.TopicArn !== expected) {
    return Response.json({ title: "Unexpected topic", status: 403 }, { status: 403 });
  }
  if (msg.Type === "SubscriptionConfirmation") {
    // SubscribeURL is covered by the verified signature.
    if (typeof signed.SubscribeURL === "string") await fetch(signed.SubscribeURL);
    log.info({ topic: msg.TopicArn }, "SNS subscription confirmed");
    return new Response(null, { status: 200 });
  }
  if (msg.Type === "Notification") {
    await processSesEvent(msg.Message);
  }
  return new Response(null, { status: 200 });
}
