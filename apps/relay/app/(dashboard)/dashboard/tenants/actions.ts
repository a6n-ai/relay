"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { REALM_SLUGS, parseCreateTenantForm } from "@/lib/tenants/forms";
import { issueTenantApiKey, tenantsService } from "@/lib/services/tenants.service";

export async function createTenantAction(formData: FormData): Promise<{ secret?: string; error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const parsed = parseCreateTenantForm(formData);
  if ("error" in parsed) return parsed;
  const { name, slug, mailingCountry, physicalAddress } = parsed.value;
  try {
    const tenant = await tenantsService.create({ name, slug, mailingCountry, physicalAddress });
    const secret = await issueTenantApiKey(tenant.id, "default");
    revalidatePath("/dashboard/tenants");
    return { secret };
  } catch {
    return { error: "Could not create tenant (slug may already exist)" };
  }
}

export async function provisionRealmTenantsAction(): Promise<{
  created: { slug: string; secret: string }[];
  error?: string;
}> {
  await requirePermission({ tenant: ["write"] });
  const created: { slug: string; secret: string }[] = [];
  try {
    for (const spec of REALM_SLUGS) {
      const existing = await tenantsService.findBySlug(spec.slug);
      if (existing) continue;
      const tenant = await tenantsService.create({
        name: spec.name,
        slug: spec.slug,
        mailingCountry: spec.mailingCountry,
      });
      const secret = await issueTenantApiKey(tenant.id, "realm");
      created.push({ slug: spec.slug, secret });
    }
    revalidatePath("/dashboard/tenants");
    return { created };
  } catch {
    return { created, error: "Could not provision Realm tenants" };
  }
}
