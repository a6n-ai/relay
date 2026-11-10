import { ZapIcon } from "lucide-react";
import { PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
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

  return (
    <PageShell>
      <ViewHeader
        icon={ZapIcon}
        title="Automations"
        subtitle="When something happens in an app, add that person to a group so you can email them later."
      />
      <OperatorSplit
        createLabel="New automation"
        create={
          <SectionCard title="New automation">
            <CreateAutomationForm tenants={tenantRows} lists={lists} />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Rules"
            glyph="zap"
            emptyMessage="No automations yet. Use New automation to add one."
            searchPlaceholder="Search automations"
            filters={AUTOMATION_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
