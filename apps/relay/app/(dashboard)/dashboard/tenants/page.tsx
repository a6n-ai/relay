import { inArray } from "drizzle-orm";
import { KeyIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { tenantsService } from "@/lib/services/tenants.service";
import { countTenantsSendsThisMonth } from "@/lib/tenants/usage";
import { CreateTenantForm } from "./create-tenant-form";

export const dynamic = "force-dynamic";

const APP_FILTERS: ListingFilter[] = [
  { id: "live", label: "Live" },
  { id: "no-key", label: "No key" },
  { id: "revoked", label: "Revoked" },
];

export default async function TenantsPage() {
  const { items: list } = await tenantsService.listRecent();
  const ids = list.map((t) => t.id);
  const [usedByTenant, keyRows] = await Promise.all([
    countTenantsSendsThisMonth(ids),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({ tenantId: apiKeys.tenantId, revokedAt: apiKeys.revokedAt })
          .from(apiKeys)
          .where(inArray(apiKeys.tenantId, ids)),
  ]);
  const keysByTenant = new Map<string, { revokedAt: number | null }[]>();
  for (const row of keyRows) {
    const key = String(row.tenantId);
    const bucket = keysByTenant.get(key) ?? [];
    bucket.push({ revokedAt: row.revokedAt });
    keysByTenant.set(key, bucket);
  }

  const items: ListingRow[] = list.map((t) => {
    const keys = keysByTenant.get(String(t.id)) ?? [];
    const used = usedByTenant.get(String(t.id)) ?? 0;
    const filterKeys: string[] = [];
    if (keys.length === 0) filterKeys.push("no-key");
    if (keys.some((k) => !k.revokedAt)) filterKeys.push("live");
    if (keys.some((k) => k.revokedAt)) filterKeys.push("revoked");
    const quota = t.monthlyMessageQuota === 0 ? "unlimited" : String(t.monthlyMessageQuota);
    const meta = `${t.slug} · sent ${used} of ${quota} this month`;
    return {
      id: t.publicId,
      title: t.name,
      meta,
      href: `/dashboard/tenants/${t.publicId}`,
      searchText: `${t.name} ${t.slug} ${meta}`,
      filterKeys,
      badges:
        keys.length === 0
          ? [{ label: "No key", variant: "outline" }]
          : keys.slice(0, 2).map((k) => ({
              label: k.revokedAt ? "Revoked" : "Live",
              variant: k.revokedAt ? "destructive" : "secondary",
            })),
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={KeyIcon}
        title="Apps"
        subtitle="Each app (Tiffin Grab, Realm) has its own monthly send limit and From address."
      />
      <OperatorSplit
        create={
          <SectionCard title="Add an app" subtitle="You’ll get an access key once. Copy it now. We can’t show it again.">
            <CreateTenantForm />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Your apps"
            glyph="key"
            emptyMessage="No apps yet. Add one on the left to start sending."
            searchPlaceholder="Search apps"
            filters={APP_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
