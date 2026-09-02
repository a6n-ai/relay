import { eq } from "@foundry/commons";
import { KeyIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { apiKeysService, tenantsService } from "@/lib/services/tenants.service";
import { countTenantSendsThisMonth } from "@/lib/tenants/usage";
import { CreateTenantForm } from "./create-tenant-form";

export const dynamic = "force-dynamic";

const APP_FILTERS: ListingFilter[] = [
  { id: "live", label: "Live" },
  { id: "no-key", label: "No key" },
  { id: "revoked", label: "Revoked" },
];

export default async function TenantsPage() {
  const { items: list } = await tenantsService.listRecent();
  const withUsage = await Promise.all(
    list.map(async (t) => {
      const [{ items: keys }, used] = await Promise.all([
        apiKeysService.list(eq("tenantId", t.id), { page: 0, size: 20 }),
        countTenantSendsThisMonth(t.id),
      ]);
      return { t, keys, used };
    }),
  );

  const items: ListingRow[] = withUsage.map(({ t, keys, used }) => {
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
