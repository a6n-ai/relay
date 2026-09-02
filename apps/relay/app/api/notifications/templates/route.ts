import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { templatesService } from "@/lib/services/templates.service";

const saveSchema = z.object({
  tenantPublicId: z.string().min(1),
  event: z.string().trim().min(1),
  channel: z.enum(["email", "in_app", "sms", "whatsapp"]),
  locale: z.string().trim().min(1).default("en"),
  subject: z.string().trim().min(1),
  body: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  providerTemplateId: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const GET = handler(async () => {
  await operatorGuard();
  const page = await templatesService.listRecent();
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
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  await templatesService.upsertForTenant(parsed.data);
  return json({ ok: true });
});
