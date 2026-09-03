import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { z } from "zod";
import { operatorGuard } from "@/lib/campaigns/http";
import { issueTenantApiKey, tenantsService } from "@/lib/services/tenants.service";

const createSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  mailingCountry: z.string().trim().min(2).max(8).default("CA"),
  physicalAddress: z.string().trim().optional(),
  monthlyMessageQuota: z.number().int().min(0).default(10000),
});

function appJson(row: {
  publicId: string;
  name: string;
  slug: string;
  mailingCountry: string;
  physicalAddress: string | null;
  monthlyMessageQuota: number;
  mailboxSeatQuota: number;
}) {
  return {
    publicId: row.publicId,
    name: row.name,
    slug: row.slug,
    mailingCountry: row.mailingCountry,
    physicalAddress: row.physicalAddress,
    monthlyMessageQuota: row.monthlyMessageQuota,
    mailboxSeatQuota: row.mailboxSeatQuota,
  };
}

export const GET = handler(async () => {
  await operatorGuard();
  const { items } = await tenantsService.listRecent();
  return json(items.map(appJson));
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
  try {
    const tenant = await tenantsService.create({
      name: parsed.data.name,
      slug: parsed.data.slug,
      mailingCountry: parsed.data.mailingCountry,
      physicalAddress: parsed.data.physicalAddress ?? null,
      monthlyMessageQuota: parsed.data.monthlyMessageQuota,
    });
    const secret = await issueTenantApiKey(tenant.id, "default");
    return json({ ...appJson(tenant), secret }, 201);
  } catch {
    throw new ValidationError("Could not create app (short name may already exist)");
  }
});
