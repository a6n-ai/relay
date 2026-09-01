"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { issueTenantApiKey, tenantsService } from "@/lib/services/tenants.service";

const REALM_SLUGS = [
  { name: "Tiffin Grab", slug: "tiffin-grab", mailingCountry: "CA" },
  { name: "Puchkaman", slug: "puchkaman", mailingCountry: "CA" },
] as const;

export async function createTenantAction(formData: FormData): Promise<{ secret?: string; error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const mailingCountry = String(formData.get("mailingCountry") ?? "CA").trim().toUpperCase() || "CA";
  const physicalAddress = String(formData.get("physicalAddress") ?? "").trim() || null;
  if (!name || !slug) return { error: "Name and slug are required" };
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
