import { MailboxIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { SettingsPage } from "@/components/ds/settings";
import { ListingTable, type ListingFilter, type ListingRow } from "@/components/ds/listing-table";
import { mailboxKindLabel } from "@/components/ds/plain-labels";
import { inList } from "@foundry/commons";
import { mailboxAccess, visibleMailboxes } from "@/lib/mailbox/access";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { AddMailboxPicker } from "./add-mailbox-picker";
import { ViewHeader } from "@/components/ds/view-header";
import { can, requirePagePermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mailboxes" };

export default async function MailboxesSettingsPage() {
  await requirePagePermission({ settings: ["read"] });
  const [{ items: apps }, { items: domains }, access, canManage] = await Promise.all([
    tenantsService.listRecent(),
    sendingDomainsService.listRecent(undefined, 500),
    mailboxAccess(),
    can({ mailbox: ["manage"] }),
  ]);
  // Mailboxes are not scoped to a workspace on their own, so take only this workspace's apps.
  const { items: allBoxes } =
    apps.length === 0 ? { items: [] } : await tenantMailboxesService.listRecent(inList("tenantId", apps.map((a) => a.id)), 500);
  const boxes = visibleMailboxes(allBoxes, access);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const items: ListingRow[] = [];
  for (const b of boxes) {
    const app = appById.get(b.tenantId);
    if (!app) continue;
    items.push({
      id: b.publicId,
      title: b.email,
      href: `/dashboard/settings/mailboxes/${b.publicId}`,
      meta: `${app.name} · ${mailboxKindLabel(b.kind)}${b.canSend && b.verifiedAt ? " · Sends as" : ""}`,
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

  const create = (pill: boolean) => (
    <CreateDialog
      label="New mailbox"
      description="Pick the app, then the name. The domain must already be proven under Email sending. A Relay inbox starts receiving once your domain forwards that address to Relay."
      pill={pill}
    >
      <AddMailboxPicker apps={pickerApps} />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="Mailboxes"
        actions={canManage && apps.length > 0 ? create(false) : undefined}
      />
      <SettingsPage
        title="Mailboxes"
        subtitle={canManage ? "Every address in this workspace." : "Mailboxes you can see in this workspace."}
      >
        <ListingTable
          framed
          title="All mailboxes"
          empty={
            <EmptyState
              icon={MailboxIcon}
              title="No mailboxes yet"
              lines={["A mailbox is an address an app sends from or receives at.", "Add one after you prove a domain."]}
              action={canManage ? create(true) : undefined}
              docsHref="/docs"
            />
          }
          searchPlaceholder="Search addresses"
          filters={filters}
          items={items}
        />
      </SettingsPage>
    </PageShell>
  );
}
