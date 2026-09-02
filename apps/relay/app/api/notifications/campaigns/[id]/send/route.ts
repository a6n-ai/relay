import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { materializeTenantCampaign } from "@/lib/campaigns/materialize-tenant";
import { operatorGuard } from "@/lib/campaigns/http";

const bodySchema = z.object({
  confirmedCount: z.number().int().nonnegative(),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const { queued } = await materializeTenantCampaign(id);
  if (queued !== parsed.data.confirmedCount) {
    return json({
      queued,
      warning: `Audience changed: approved ${parsed.data.confirmedCount}, queued ${queued}`,
    });
  }
  return json({ queued });
});
