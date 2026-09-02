import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { createCampaignSchema } from "@relay/engine";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { campaignsService } from "@/lib/services/campaigns.service";

const CHANNELS = ["email", "sms", "whatsapp", "in_app"] as [string, ...string[]];
const createBody = createCampaignSchema(CHANNELS).extend({
  tenantPublicId: z.string().min(1),
});

export const GET = handler(async () => {
  await operatorGuard();
  const page = await campaignsService.listRecent();
  return json(page.items);
});

export const POST = handler(async (req: Request) => {
  await operatorGuard();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = createBody.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const row = await campaignsService.createForTenant(parsed.data);
  return json({ publicId: row.publicId }, 201);
});
