"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { emailSendersService } from "@/lib/services/email-senders.service";
import { issueTenantApiKey, tenantsService } from "@/lib/services/tenants.service";
import { parseApiKeyChannels } from "@/lib/tenants/channels";
import { REALM_SLUGS, parseCreateTenantForm } from "@/lib/tenants/forms";

export async function createTenantAction(formData: FormData): Promise<{ secret?: string; error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const parsed = parseCreateTenantForm(formData);
  if ("error" in parsed) return parsed;
  const { name, slug, mailingCountry, physicalAddress, monthlyMessageQuota } = parsed.value;
  try {
    const tenant = await tenantsService.create({ name, slug, mailingCountry, physicalAddress, monthlyMessageQuota });
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
        monthlyMessageQuota: 10000,
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

export async function updateTenantQuotaAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const publicId = String(formData.get("publicId") ?? "");
  const quotaRaw = Number(formData.get("monthlyMessageQuota") ?? "");
  if (!publicId) return { error: "Missing tenant" };
  const monthlyMessageQuota = Number.isFinite(quotaRaw) && quotaRaw >= 0 ? Math.floor(quotaRaw) : -1;
  if (monthlyMessageQuota < 0) return { error: "Quota must be 0 or a positive integer" };
  await tenantsService.update(publicId, { monthlyMessageQuota });
  revalidatePath("/dashboard/tenants");
  revalidatePath(`/dashboard/tenants/${publicId}`);
  return {};
}

export async function issueTenantKeyAction(formData: FormData): Promise<{ secret?: string; error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const publicId = String(formData.get("publicId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "api";
  if (!publicId) return { error: "Missing tenant" };
  const tenant = await tenantsService.read(publicId).catch(() => null);
  if (!tenant) return { error: "Unknown tenant" };
  const secret = await issueTenantApiKey(tenant.id, name, parseApiKeyChannels(formData));
  revalidatePath("/dashboard/tenants");
  revalidatePath(`/dashboard/tenants/${publicId}`);
  return { secret };
}

export async function addTenantSenderAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const publicId = String(formData.get("publicId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  if (!publicId) return { error: "Missing tenant" };
  if (!email.includes("@")) return { error: "Valid sender email is required" };
  const tenant = await tenantsService.read(publicId).catch(() => null);
  if (!tenant) return { error: "Unknown tenant" };
  try {
    await emailSendersService.createForTenant({ tenantId: tenant.id, email, displayName });
  } catch {
    return { error: "Could not add sender (it may already exist)" };
  }
  revalidatePath(`/dashboard/tenants/${publicId}`);
  return {};
}

