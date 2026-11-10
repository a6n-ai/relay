import { UsersIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { consentSourceLabel } from "@/components/ds/plain-labels";
import { contactListsService } from "@/lib/services/campaigns.service";
import { ViewHeader } from "@/components/ds/view-header";
import { ImportPeopleForms } from "./import-people-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "People" };

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
    const meta = `${l.memberCount.toLocaleString("en")} people · ${source} · opted in ${optedIn}`;
    return {
      id: l.publicId,
      title: l.name,
      meta,
      searchText: `${l.name} ${source} ${meta}`,
      filterKeys: [l.consentSource],
    };
  });

  const create = (pill: boolean) => (
    <CreateDialog label="Import people" pill={pill}>
      <ImportPeopleForms />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="People"
        subtitle="Who can hear from you. We need how they opted in, and when. Purchase opt-in lasts 24 months in Canada."
        actions={create(false)}
      />
      <FilteredResourceList
        title="Groups"
        empty={
          <EmptyState
            icon={UsersIcon}
            title="No people yet"
            lines={["Import a spreadsheet or add people by hand.", "We keep how and when each group opted in."]}
            action={create(true)}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search groups"
        filters={PEOPLE_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
