import { InboxIcon } from "lucide-react";
import { PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { mailboxKindLabel } from "@/components/ds/plain-labels";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { AddMailboxPicker } from "./add-mailbox-picker";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mailboxes" };

export default async function MailboxesSettingsPage() {
  const [{ items: apps }, { items: boxes }, { items: domains }] = await Promise.all([
    tenantsService.listRecent(),
    tenantMailboxesService.listRecent(undefined, 500),
    sendingDomainsService.listRecent(undefined, 500),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const items: ListingRow[] = [];
  for (const b of boxes) {
    const app = appById.get(b.tenantId);
    if (!app) continue;
    items.push({
      id: b.publicId,
      title: b.email,
      meta: `${app.name} · ${mailboxKindLabel(b.kind)}`,
      searchText: `${b.email} ${app.name}`,
      filterKeys: [app.publicId],
    });
  }
  const filters: ListingFilter[] = apps.map((a) => ({ id: a.publicId, label: a.name }));
  const pickerApps = apps.map((a) => ({
    publicId: a.publicId,
    name: a.name,
    domains: domains.filter((d) => d.tenantId === a.id && d.status === "verified").map((d) => d.domain),
  }));

  return (
    <PageShell>
      <ViewHeader
        icon={InboxIcon}
        title="Mailboxes"
        subtitle="Addresses your apps send from and receive at. Letters to a Relay inbox show up in Inbox."
      />
      <OperatorSplit
        create={
          <SectionCard
            title="Add a mailbox"
            subtitle="Pick the app, then the name. The domain must already be proven under Email sending. A Relay inbox starts receiving once your domain forwards that address to Relay."
          >
            <AddMailboxPicker apps={pickerApps} />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="All mailboxes"
            glyph="inbox"
            emptyMessage="No mailboxes yet. Use Add a mailbox to create one."
            searchPlaceholder="Search addresses"
            filters={filters}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
