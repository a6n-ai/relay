import MessageValidator from "sns-validator";
import { createLogger } from "@foundry/commons/logger";
import { parseSnsEnvelope, sesSuppressionsFromEvent } from "@/lib/notifications/ses-events";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";
import { enqueueTenantWebhooks } from "@/lib/webhooks/enqueue";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";

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
  const event = JSON.parse(messageJson) as Parameters<typeof sesSuppressionsFromEvent>[0];
  const rows = sesSuppressionsFromEvent(event);
  if (rows.length === 0) return;
  const type = event.eventType ?? event.notificationType;
  const webhookEvent = type === "Complaint" ? "message.complained" : "message.bounced";
  const all = await db.select({ id: tenants.id }).from(tenants);
  for (const row of rows) {
    await suppressEmailRecipient(row.email, row.reason);
    for (const t of all) {
      await enqueueTenantWebhooks(t.id, webhookEvent, { email: row.email, reason: row.reason });
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const parsed = parseSnsEnvelope(raw);
  if (!parsed) {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  const msg: SnsEnvelope = parsed;
  try {
    await verify(msg);
  } catch (err) {
    log.error({ err }, "SNS signature verification failed");
    return Response.json({ title: "Invalid signature", status: 403 }, { status: 403 });
  }
  const expected = process.env.SES_FEEDBACK_TOPIC_ARN;
  if (expected && msg.TopicArn !== expected) {
    return Response.json({ title: "Unexpected topic", status: 403 }, { status: 403 });
  }
  if (msg.Type === "SubscriptionConfirmation") {
    log.info({ topic: msg.TopicArn }, "SNS subscription confirmation; confirm the subscription in AWS");
    return new Response(null, { status: 200 });
  }
  if (msg.Type === "Notification") {
    await processSesEvent(msg.Message);
  }
  return new Response(null, { status: 200 });
}
