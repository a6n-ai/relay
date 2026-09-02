import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { listAutomationsService } from "@/lib/services/automations.service";
import { contactListsService } from "@/lib/services/campaigns.service";
import { tenantsService } from "@/lib/services/tenants.service";

const createSchema = z.object({
  tenantPublicId: z.string().min(1),
  name: z.string().trim().min(1),
  triggerEvent: z.string().trim().min(1),
  listPublicId: z.string().min(1),
});

export const GET = handler(async () => {
  await operatorGuard();
  const page = await listAutomationsService.listRecent();
  const tenants = await tenantsService.listRecent();
  const lists = await contactListsService.listRecent();
  return json(
    page.items.map((row) => ({
      publicId: row.publicId,
      name: row.name,
      triggerEvent: row.triggerEvent,
      enabled: row.enabled,
      tenantName: tenants.items.find((t) => t.id === row.tenantId)?.name ?? null,
      listName: lists.items.find((l) => l.id === row.listId)?.name ?? null,
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
  const row = await listAutomationsService.createRule(parsed.data);
  return json({ publicId: row.publicId }, 201);
});
