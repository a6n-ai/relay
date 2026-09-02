export const REALM_SLUGS = [
  { name: "Tiffin Grab", slug: "tiffin-grab", mailingCountry: "CA" },
  { name: "Puchkaman", slug: "puchkaman", mailingCountry: "CA" },
] as const;

export type CreateTenantInput = {
  name: string;
  slug: string;
  mailingCountry: string;
  physicalAddress: string | null;
  monthlyMessageQuota: number;
};

export function parseCreateTenantForm(formData: FormData): { error: string } | { value: CreateTenantInput } {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const mailingCountry = String(formData.get("mailingCountry") ?? "CA").trim().toUpperCase() || "CA";
  const physicalAddress = String(formData.get("physicalAddress") ?? "").trim() || null;
  const quotaRaw = Number(formData.get("monthlyMessageQuota") ?? "10000");
  const monthlyMessageQuota = Number.isFinite(quotaRaw) && quotaRaw >= 0 ? Math.floor(quotaRaw) : 10000;
  if (!name || !slug) return { error: "Name and short name are required" };
  return { value: { name, slug, mailingCountry, physicalAddress, monthlyMessageQuota } };
}
