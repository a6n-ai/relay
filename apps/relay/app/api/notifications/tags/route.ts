import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { tenantsService } from "@/lib/services/tenants.service";

const addSchema = z.object({
  tenantPublicId: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

const removeSchema = z.object({
  tenantPublicId: z.string().trim().min(1),
  slug: z.string().trim().min(1),
});

export const GET = handler(async () => {
  await operatorGuard();
  const [tags, { items: apps }] = await Promise.all([
    appMessageTagsService.listRecentAll(),
    tenantsService.listRecent(),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  return json(
    tags.flatMap((t) => {
      const app = appById.get(t.tenantId);
      if (!app) return [];
      return [
        {
          publicId: t.publicId,
          slug: t.slug,
          label: t.label,
          tenantPublicId: app.publicId,
          appName: app.name,
        },
      ];
    }),
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
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const tenant = await tenantsService.read(parsed.data.tenantPublicId).catch(() => null);
  if (!tenant) throw new ValidationError("Unknown app");
  const result = await appMessageTagsService.addToApp(tenant.id, parsed.data.label);
  if ("error" in result && result.error) throw new ValidationError(result.error);
  return json({ ok: true });
});

export const DELETE = handler(async (req: Request) => {
  await operatorGuard();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const tenant = await tenantsService.read(parsed.data.tenantPublicId).catch(() => null);
  if (!tenant) throw new ValidationError("Unknown app");
  await appMessageTagsService.removeFromApp(tenant.id, parsed.data.slug);
  return json({ ok: true });
});
