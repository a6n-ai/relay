import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { setCampaignContentSchema } from "@relay/engine";
import { operatorGuard } from "@/lib/campaigns/http";
import { campaignContentService } from "@/lib/services/campaigns.service";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = setCampaignContentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return json(await campaignContentService.saveForCampaign(id, parsed.data));
});
