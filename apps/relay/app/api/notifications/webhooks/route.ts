import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { tenantWebhooksService } from "@/lib/services/webhooks.service";
import { tenantsService } from "@/lib/services/tenants.service";

const createSchema = z.object({
  tenantPublicId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.enum(["message.queued", "message.sent", "message.failed", "message.bounced", "message.complained"])).min(1),
});

export const GET = handler(async () => {
  await operatorGuard();
  const page = await tenantWebhooksService.listRecent();
  const tenants = await tenantsService.listRecent();
  return json(
    page.items.map((row) => ({
      publicId: row.publicId,
      url: row.url,
      events: row.events,
      enabled: row.enabled,
      tenantName: tenants.items.find((t) => t.id === row.tenantId)?.name ?? null,
    })),
  );
});

export const POST = handler(async (req: Request) => {
  await operatorGuard();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return json(await tenantWebhooksService.createForTenant(parsed.data), 201);
});
