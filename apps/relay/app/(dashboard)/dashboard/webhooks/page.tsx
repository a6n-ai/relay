import { WebhookIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { webhookEventLabel } from "@/components/ds/plain-labels";
import { tenantsService } from "@/lib/services/tenants.service";
import { tenantWebhooksService } from "@/lib/services/webhooks.service";
import { CreateWebhookForm } from "./create-webhook-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Status updates" };

const DESTINATION_FILTERS: ListingFilter[] = [
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

export default async function WebhooksPage() {
  const [{ items: tenantRows }, { items: rows }] = await Promise.all([
    tenantsService.listRecent(),
    tenantWebhooksService.listRecent(),
  ]);

  const tenantById = new Map(tenantRows.map((t) => [t.id, t]));
  const items: ListingRow[] = rows.map((r) => {
    const tenant = tenantById.get(r.tenantId);
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

  const create = (pill: boolean) => (
    <CreateDialog label="New destination" pill={pill}>
      <CreateWebhookForm tenants={tenantRows} />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="Status updates"
        subtitle="Tell another system when a message is waiting, sent, or didn’t go out. We’ll retry a few times if that system is down."
        section="activity"
        actions={create(false)}
      />
      <FilteredResourceList
        title="Destinations"
        empty={
          <EmptyState
            icon={WebhookIcon}
            title="No destinations yet"
            lines={["A destination is a web address that hears when a message is sent or fails.", "Add one so your app stays in step."]}
            action={create(true)}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search destinations"
        filters={DESTINATION_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
