import { eq } from "drizzle-orm";
import { MegaphoneIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { campaignStatusLabel } from "@/components/ds/plain-labels";
import { campaignGlyph } from "@/components/ds/status-glyph";
import { db } from "@/db/client";
import { campaignTenant, tenants } from "@/db/schema";
import { campaignsService, contactListsService } from "@/lib/services/campaigns.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { CreateCampaignForm } from "./create-campaign-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns" };

const CAMPAIGN_FILTERS: ListingFilter[] = [
  { id: "draft", label: "Draft" },
  { id: "scheduled", label: "Scheduled" },
  { id: "sending", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "paused", label: "Paused" },
  { id: "cancelled", label: "Cancelled" },
];

/** Groups run in this order: what needs attention first, finished work last. */
const STATUS_ORDER = ["sending", "scheduled", "draft", "sent", "completed", "paused", "cancelled"];
const statusRank = (status: string) => {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
};

const CREATE_NOTE = "The app you pick supplies the From address and the legal footer.";

export default async function CampaignsPage() {
  const [{ items: campaigns }, { items: tenantRows }, { items: lists }, bindings] = await Promise.all([
    campaignsService.listRecent(),
    tenantsService.listRecent(),
    contactListsService.listRecent(),
    db
      .select({ campaignId: campaignTenant.campaignId, tenantName: tenants.name })
      .from(campaignTenant)
      .innerJoin(tenants, eq(campaignTenant.tenantId, tenants.id)),
  ]);
  const tenantNameByCampaign = new Map(bindings.map((b) => [String(b.campaignId), b.tenantName]));

  const items: ListingRow[] = [...campaigns]
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .map((c) => {
      const status = campaignStatusLabel(c.status);
      const meta = tenantNameByCampaign.get(String(c.id)) ?? "No app chosen";
      return {
        id: c.publicId,
        title: c.name,
        meta,
        href: `/dashboard/campaigns/${c.publicId}`,
        searchText: `${c.name} ${meta} ${status}`,
        filterKeys: [c.status],
        shortId: c.publicId.slice(-6).toUpperCase(),
        glyph: campaignGlyph(c.status),
        glyphLabel: status,
        group: status,
        groupGlyph: campaignGlyph(c.status),
      };
    });

  const form = <CreateCampaignForm tenants={tenantRows} lists={lists} />;
  const create = (pill: boolean) => (
    <CreateDialog label="New campaign" description={CREATE_NOTE} pill={pill}>
      {form}
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="Campaigns"
        subtitle="One send to a group of people. Saved as a draft until you confirm."
        section="campaigns"
        actions={create(false)}
      />
      <FilteredResourceList
        title="Campaigns by status"
        empty={
          <EmptyState
            icon={MegaphoneIcon}
            title="No campaigns yet"
            lines={["A campaign is one message to a group of people.", "It stays a draft until you confirm the send."]}
            action={create(true)}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search campaigns"
        filters={CAMPAIGN_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
