import { WebhookIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { webhookEventLabel } from "@/components/ds/plain-labels";
import { tenantsService } from "@/lib/services/tenants.service";
import { tenantWebhooksService } from "@/lib/services/webhooks.service";
import { CreateWebhookForm } from "./create-webhook-form";

export const dynamic = "force-dynamic";

const DESTINATION_FILTERS: ListingFilter[] = [
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

export default async function WebhooksPage() {
  const [{ items: tenantRows }, { items: rows }] = await Promise.all([
    tenantsService.listRecent(),
    tenantWebhooksService.listRecent(),
  ]);

  const items: ListingRow[] = rows.map((r) => {
    const tenant = tenantRows.find((t) => t.id === r.tenantId);
    const title = tenant?.name ?? "App";
    const eventLabels = r.events.map((ev) => webhookEventLabel(ev));
    return {
      id: r.publicId,
      title,
      meta: r.url,
      searchText: `${title} ${r.url} ${eventLabels.join(" ")}`,
      filterKeys: [r.enabled ? "on" : "off"],
      badges: [
        ...eventLabels.slice(0, 3).map((label) => ({ label, variant: "outline" as const })),
        ...(r.enabled ? [] : [{ label: "Off", variant: "destructive" as const }]),
      ],
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={WebhookIcon}
        title="Status updates"
        subtitle="Tell another system when a message is waiting, sent, or didn’t go out. We’ll retry a few times if that system is down."
      />
      <OperatorSplit
        create={
          <SectionCard title="New destination">
            <CreateWebhookForm tenants={tenantRows} />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Destinations"
            glyph="webhook"
            emptyMessage="No destinations yet. Add one on the left."
            searchPlaceholder="Search destinations"
            filters={DESTINATION_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
