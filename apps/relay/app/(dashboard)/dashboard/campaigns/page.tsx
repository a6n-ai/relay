import { MegaphoneIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { campaignStatusLabel } from "@/components/ds/plain-labels";
import { campaignsService, contactListsService } from "@/lib/services/campaigns.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { CreateCampaignForm } from "./create-campaign-form";

export const dynamic = "force-dynamic";

const CAMPAIGN_FILTERS: ListingFilter[] = [
  { id: "draft", label: "Draft" },
  { id: "scheduled", label: "Scheduled" },
  { id: "sending", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "paused", label: "Paused" },
  { id: "cancelled", label: "Cancelled" },
];

export default async function CampaignsPage() {
  const [{ items: campaigns }, { items: tenantRows }, { items: lists }] = await Promise.all([
    campaignsService.listRecent(),
    tenantsService.listRecent(),
    contactListsService.listRecent(),
  ]);
  const withTenant = await Promise.all(
    campaigns.map(async (c) => ({
      ...c,
      tenantName: (await campaignsService.tenantForCampaign(c.id))?.name,
    })),
  );

  const items: ListingRow[] = withTenant.map((c) => {
    const status = campaignStatusLabel(c.status);
    const meta = c.tenantName ?? "No app chosen";
    return {
      id: c.publicId,
      title: c.name,
      meta,
      href: `/dashboard/campaigns/${c.publicId}`,
      searchText: `${c.name} ${meta} ${status}`,
      filterKeys: [c.status],
      badges: [{ label: status, variant: "outline" }],
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={MegaphoneIcon}
        title="Campaigns"
        subtitle="One send to a group of people. Saved as a draft until you confirm."
      />
      <OperatorSplit
        create={
          <SectionCard title="New campaign" subtitle="The app you pick supplies the From address and the legal footer.">
            <CreateCampaignForm tenants={tenantRows} lists={lists} />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Drafts and sent"
            glyph="megaphone"
            emptyMessage="No campaigns yet. Start one on the left."
            searchPlaceholder="Search campaigns"
            filters={CAMPAIGN_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
