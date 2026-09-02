import { eq } from "drizzle-orm";
import { buildTenantHandlers, createRateLimiter, drainPending as drain, dueCampaigns } from "@relay/engine";
import type { ChannelProvider } from "@relay/engine";
import { db } from "@/db/client";
import { campaignTables, notificationTables, tenants } from "@/db/schema";
import { materializeTenantCampaign } from "@/lib/campaigns/materialize-tenant";
import { getEmailProvider, hydrateSmtpFromDb } from "@/lib/email/provider";
import { resolveTenantEmailFrom } from "@/lib/email/from-address";
import { smsProviderFromEnv, whatsappProviderFromEnv } from "@/lib/notifications/phone-providers";
import { enqueueTenantWebhooks } from "@/lib/webhooks/enqueue";
import { drainWebhookDeliveries } from "@/lib/webhooks/drain";

const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

function unsubscribeConfig() {
  const secret = process.env.RELAY_UNSUBSCRIBE_SECRET ?? process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3010";
  if (!secret) throw new Error("RELAY_UNSUBSCRIBE_SECRET or BETTER_AUTH_SECRET is required to drain marketing mail");
  return { baseUrl, secret };
}

function emailChannelProvider(): ChannelProvider {
  const provider = getEmailProvider();
  return {
    send: (msg) =>
      provider.send({
        to: { email: msg.to.email! },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
        from: msg.from,
      }),
  };
}

export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  await hydrateSmtpFromDb();
  const unsubscribe = unsubscribeConfig();
  const sms = smsProviderFromEnv();
  const whatsapp = whatsappProviderFromEnv();
  return drain(
    {
      db,
      tables: notificationTables as never,
      handlers: buildTenantHandlers({
        db,
        tables: notificationTables,
        providers: {
          email: emailChannelProvider(),
          ...(sms ? { sms } : {}),
          ...(whatsapp ? { whatsapp } : {}),
        },
        loadFromAddress: async (tenantId) => {
          const resolved = await resolveTenantEmailFrom(tenantId);
          if (!resolved) return null;
          return { email: resolved.email, name: resolved.name };
        },
        campaigns: {
          tables: campaignTables,
          unsubscribe,
          loadSender: async (tenantId) => {
            const [row] = await db
              .select({ name: tenants.name, physicalAddress: tenants.physicalAddress })
              .from(tenants)
              .where(eq(tenants.id, tenantId));
            if (!row) return null;
            return { name: row.name, postalAddress: row.physicalAddress ?? "" };
          },
        },
      }),
      rateLimiter: createRateLimiter(SEND_RATE),
      onProcessed: async (row, outcome) => {
        const event = outcome.status === "failed" ? "message.failed" : "message.sent";
        await enqueueTenantWebhooks(row.tenantId as bigint, event, {
          outboxPublicId: row.publicId,
          channel: row.channel,
          kind: row.kind,
          event: row.event,
          recipientEmail: row.recipientEmail,
          recipientPhone: row.recipientPhone,
          providerMessageId: outcome.providerMessageId ?? null,
          skipped: outcome.skipped ?? false,
          lastError: outcome.lastError ?? null,
        });
      },
    },
    limit,
    maxBatches,
  );
}

export async function materializeDueCampaigns(): Promise<number> {
  const ids = await dueCampaigns(db, campaignTables);
  let n = 0;
  for (const id of ids) {
    const { queued } = await materializeTenantCampaign(id);
    n += queued;
  }
  return n;
}

export async function workerTick(): Promise<{ campaigns: number; drained: number; webhooks: number }> {
  const campaigns = await materializeDueCampaigns();
  const drained = await drainPending();
  const webhooks = await drainWebhookDeliveries();
  return { campaigns, drained, webhooks };
}
