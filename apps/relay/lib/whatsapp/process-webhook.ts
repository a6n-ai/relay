import { eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { recordCampaignEvent } from "@relay/engine";
import type { WhatsAppStatusUpdate, WhatsAppWebhookEvent } from "@relay/whatsapp";
import { db } from "@/db/client";
import { campaignTables, notificationOutbox, notificationTables } from "@/db/schema";
import { enqueueTenantWebhooks } from "@/lib/webhooks/enqueue";

const log = createLogger("whatsapp-webhook");

/**
 * Apply parsed Meta webhook events.
 * Statuses correlate to outbox via provider_message_id; inbound/account_update are logged
 * until multi-WABA conversation storage lands (Phase 3+).
 */
export async function processWhatsAppWebhookEvents(events: WhatsAppWebhookEvent[]): Promise<void> {
  for (const event of events) {
    switch (event.kind) {
      case "status":
        await processStatus(event);
        break;
      case "inbound_message":
        log.info(
          {
            phoneNumberId: event.metadata.phoneNumberId,
            from: event.from,
            messageId: event.messageId,
            type: event.type,
          },
          "whatsapp inbound message (persist deferred)",
        );
        break;
      case "account_update":
        log.info({ wabaId: event.wabaId, event: event.event }, "whatsapp account_update");
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  }
}

async function processStatus(event: WhatsAppStatusUpdate): Promise<void> {
  const [row] = await db
    .select({
      tenantId: notificationOutbox.tenantId,
      publicId: notificationOutbox.publicId,
      channel: notificationOutbox.channel,
      kind: notificationOutbox.kind,
      event: notificationOutbox.event,
      recipientPhone: notificationOutbox.recipientPhone,
      campaignId: notificationOutbox.campaignId,
    })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.providerMessageId, event.messageId))
    .limit(1);

  if (!row) {
    log.debug({ messageId: event.messageId, status: event.status }, "whatsapp status for unknown message");
    return;
  }

  const campaignType = campaignStatKey(event.status);
  if (campaignType) {
    await recordCampaignEvent(
      { db, tables: { ...notificationTables, ...campaignTables } as never },
      event.messageId,
      campaignType,
    );
  }

  if (event.status === "failed") {
    const detail =
      event.errors?.[0]?.title ??
      event.errors?.[0]?.message ??
      "WhatsApp delivery failed";
    await db
      .update(notificationOutbox)
      .set({ status: "failed", lastError: detail.slice(0, 500) })
      .where(eq(notificationOutbox.providerMessageId, event.messageId));

    await enqueueTenantWebhooks(row.tenantId, "message.failed", {
      outboxPublicId: row.publicId,
      channel: row.channel,
      kind: row.kind,
      event: row.event,
      recipientPhone: row.recipientPhone,
      providerMessageId: event.messageId,
      whatsappStatus: event.status,
      lastError: detail,
    });
  }
}

function campaignStatKey(status: string): string | null {
  switch (status) {
    case "sent":
      return "whatsapp_sent";
    case "delivered":
      return "whatsapp_delivered";
    case "read":
      return "whatsapp_read";
    case "failed":
      return "whatsapp_failed";
    default:
      return null;
  }
}
