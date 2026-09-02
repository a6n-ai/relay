import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { createContactListSchema } from "@relay/engine";
import { operatorGuard } from "@/lib/campaigns/http";
import { contactListsService } from "@/lib/services/campaigns.service";

export const GET = handler(async () => {
  await operatorGuard();
  const page = await contactListsService.listRecent();
  return json(
    page.items.map((r) => ({
      publicId: r.publicId,
      name: r.name,
      consentSource: r.consentSource,
      consentAt: r.consentAt,
      consentNote: r.consentNote,
      memberCount: r.memberCount,
      createdAt: r.createdAt,
      isSegment: r.segmentDef != null,
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
  const parsed = createContactListSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const row = await contactListsService.create(parsed.data);
  return json({ publicId: row.publicId }, 201);
});
