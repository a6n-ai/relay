import { AppError, ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { importContactListMembers, importMappingSchema } from "@relay/engine";
import { operatorCampaignDeps } from "@/lib/campaigns/deps";
import { operatorGuard } from "@/lib/campaigns/http";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Missing file");
  const mappingRaw = form.get("mapping");
  let mappingJson: unknown = {};
  if (typeof mappingRaw === "string") {
    try {
      mappingJson = JSON.parse(mappingRaw);
    } catch {
      throw new ValidationError("Invalid mapping");
    }
  }
  const mapping = importMappingSchema.safeParse(mappingJson);
  if (!mapping.success) throw new ValidationError(mapping.error.message);
  const result = await importContactListMembers(operatorCampaignDeps(), id, file, mapping.data);
  if ("error" in result) throw new AppError(result.error, result.status);
  return json(result);
});
