import { and, eq } from "@foundry/commons";
import { UpdatableRepository, UpdatableService } from "@foundry/database";
import { db } from "@/db/client";
import { tenantWebhook, tenantWebhookDelivery, type WebhookEvent } from "@/db/schema";
import { redactFields } from "@/lib/audit/redact";
import { newWebhookSecret } from "@/lib/webhooks/sign";
import { SessionUpdatableService } from "./session-service";
import { tenantsService } from "./tenants.service";

class TenantWebhooksService extends SessionUpdatableService<typeof tenantWebhook> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return redactFields(changes, ["secret"]);
  }

  async createForTenant(input: { tenantPublicId: string; url: string; events: string[] }) {
    const tenant = await tenantsService.read(input.tenantPublicId);
    const secret = newWebhookSecret();
    const row = await this.create({
      tenantId: tenant.id,
      url: input.url,
      secret,
      events: input.events,
    });
    return { publicId: row.publicId, secret };
  }

  async enabledForTenant(tenantId: bigint) {
    const page = await this.list(
      and(eq("tenantId", tenantId), eq("enabled", true)),
      { page: 0, size: 100 },
    );
    return page.items;
  }
}

/** Delivery rows are high-volume; skip operator audit stamps. */
class WebhookDeliveryService extends UpdatableService<typeof tenantWebhookDelivery> {
  async findById(id: bigint) {
    return this.repo.findById(id);
  }

  async enqueue(values: {
    webhookId: bigint;
    tenantId: bigint;
    event: string;
    payload: Record<string, unknown>;
  }) {
    return this.create(values);
  }
}

export const tenantWebhooksService = new TenantWebhooksService(
  new UpdatableRepository(db, tenantWebhook, tenantWebhook.publicId, tenantWebhook.id),
);

export const webhookDeliveryService = new WebhookDeliveryService(
  new UpdatableRepository(db, tenantWebhookDelivery, tenantWebhookDelivery.publicId, tenantWebhookDelivery.id),
);

export async function enqueueTenantWebhooks(
  tenantId: bigint,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await tenantWebhooksService.enabledForTenant(tenantId);
  const matching = hooks.filter((h) => h.events.includes("*") || h.events.includes(event));
  for (const h of matching) {
    await webhookDeliveryService.enqueue({
      webhookId: h.id,
      tenantId,
      event,
      payload,
    });
  }
}
