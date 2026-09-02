import { ValidationError, and, eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";
import { tenantsService } from "./tenants.service";

const table = notificationTables.notificationTemplate;

class TemplatesService extends SessionUpdatableService<typeof table> {
  async upsertForTenant(input: {
    tenantPublicId: string;
    event: string;
    channel: "email" | "in_app" | "sms" | "whatsapp";
    locale: string;
    subject: string;
    body?: string;
    html?: string;
    text?: string;
    providerTemplateId?: string;
    enabled?: boolean;
  }) {
    if (input.channel === "email" && (!input.html || !input.text)) {
      throw new ValidationError("Email templates need html and text");
    }
    const tenant = await tenantsService.read(input.tenantPublicId);
    const existing = await this.list(
      and(
        eq("tenantId", tenant.id),
        eq("event", input.event),
        eq("channel", input.channel),
        eq("locale", input.locale),
      ),
      { page: 0, size: 1 },
    );
    const values = {
      tenantId: tenant.id,
      event: input.event,
      channel: input.channel,
      locale: input.locale,
      subject: input.subject,
      body: input.body ?? null,
      html: input.html ?? null,
      text: input.text ?? null,
      providerTemplateId: input.providerTemplateId ?? null,
      enabled: input.enabled ?? true,
    };
    if (existing.items[0]) return this.update(existing.items[0].publicId, values);
    return this.create(values);
  }
}

export const templatesService = new TemplatesService(
  new UpdatableRepository(db, table, table.publicId, table.id),
);
