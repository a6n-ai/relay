import { UsersIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { ContactListUpload } from "@relay/engine/ui";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { consentSourceLabel } from "@/components/ds/plain-labels";
import { contactListsService } from "@/lib/services/campaigns.service";

export const dynamic = "force-dynamic";

const PEOPLE_FILTERS: ListingFilter[] = [
  { id: "purchase", label: "Customer purchased" },
  { id: "express_optin", label: "They asked" },
  { id: "event_signup", label: "At an event" },
  { id: "import_other", label: "Imported" },
];

export default async function ListsPage() {
  const { items: lists } = await contactListsService.listRecent();

  const items: ListingRow[] = lists.map((l) => {
    const source = consentSourceLabel(l.consentSource);
    const optedIn = new Date(l.consentAt).toLocaleDateString();
    const meta = `${l.memberCount} people · ${source} · opted in ${optedIn}`;
    return {
      id: l.publicId,
      title: l.name,
      meta,
      searchText: `${l.name} ${source} ${meta}`,
      filterKeys: [l.consentSource],
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="People"
        subtitle="Who can hear from you. We need how they opted in, and when. Purchase opt-in lasts 24 months in Canada."
      />
      <OperatorSplit
        create={
          <SectionCard title="Import a spreadsheet">
            <ContactListUpload />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Groups"
            glyph="users"
            emptyMessage="No people imported yet. Use the form on the left."
            searchPlaceholder="Search groups"
            filters={PEOPLE_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
