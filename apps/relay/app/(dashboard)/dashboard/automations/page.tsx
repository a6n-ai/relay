import { ZapIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { listAutomationsService } from "@/lib/services/automations.service";
import { contactListsService } from "@/lib/services/campaigns.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { CreateAutomationForm } from "./create-automation-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Automations" };

const AUTOMATION_FILTERS: ListingFilter[] = [
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

export default async function AutomationsPage() {
  const [{ items: tenantRows }, { items: lists }, { items: rules }] = await Promise.all([
    tenantsService.listRecent(),
    contactListsService.listRecent(),
    listAutomationsService.listRecent(),
  ]);

  const items: ListingRow[] = rules.map((r) => ({
    id: r.publicId,
    title: r.name,
    meta: `When: ${r.triggerEvent}`,
    searchText: `${r.name} ${r.triggerEvent}`,
    filterKeys: [r.enabled ? "on" : "off"],
    badges: [{ label: r.enabled ? "On" : "Off", variant: r.enabled ? "secondary" : "outline" }],
  }));

  const create = (pill: boolean) => (
    <CreateDialog label="New automation" pill={pill}>
      <CreateAutomationForm tenants={tenantRows} lists={lists} />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="Automations"
        subtitle="When something happens in an app, add that person to a group so you can email them later."
        section="campaigns"
        actions={create(false)}
      />
      <FilteredResourceList
        title="Rules"
        empty={
          <EmptyState
            icon={ZapIcon}
            title="No automations yet"
            lines={["An automation adds people to a group when something happens in an app.", "Later you can email that group."]}
            action={create(true)}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search automations"
        filters={AUTOMATION_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
