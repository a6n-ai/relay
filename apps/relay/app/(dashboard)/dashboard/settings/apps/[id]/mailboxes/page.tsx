import { notFound } from "next/navigation";
import { PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { mailboxKindLabel } from "@/components/ds/plain-labels";
import { AddMailboxForm } from "@/app/(dashboard)/dashboard/tenants/tenant-ops-forms";
import { MailboxAccessGrid } from "@/components/settings/mailbox-access-grid";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { loadAccessGrid } from "@/lib/mailbox/access-grid";
import { mailboxAccess, visibleMailboxes } from "@/lib/mailbox/access";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { loadAppSettings } from "@/lib/tenants/load-app-settings";
import { eq } from "@foundry/commons";

export const dynamic = "force-dynamic";

export default async function AppMailboxesPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ tenant: ["read"] });
  const app = await loadAppSettings((await params).id);
  if (!app) notFound();
  const { tenant } = app;

  const [{ items: domains }, allBoxes, access, canManage, organizationId] = await Promise.all([
    sendingDomainsService.list(eq("tenantId", tenant.id), { page: 0, size: 50 }),
    tenantMailboxesService.forTenant(tenant.id),
    mailboxAccess(),
    can({ mailbox: ["manage"] }),
    requireActiveOrganizationId(),
  ]);
  const boxes = visibleMailboxes(allBoxes, access);
  const grid = canManage ? await loadAccessGrid(organizationId, { tenantId: tenant.id }) : null;

  return (
    <PageShell>
      <ViewHeader title={tenant.name} />
      <SettingsPage title={tenant.name} subtitle="Mailboxes">
        <SectionCard
          title="Addresses"
          subtitle="Local name plus a proven domain. Extra seats if they pay for more. Each address is Send as, a Relay inbox, or a people inbox — never two stores."
        >
          <AddMailboxForm
            publicId={tenant.publicId}
            domains={domains.filter((d) => d.status === "verified").map((d) => d.domain)}
          />
          <ul className="mt-4 space-y-2 text-sm">
            {boxes.map((b) => (
              <li key={b.publicId} className="flex flex-wrap items-center gap-2">
                <span>{b.email}</span>
                <Badge variant="secondary">{mailboxKindLabel(b.kind)}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
        {grid ? (
          <SectionCard title="Who can see these mailboxes" subtitle="Owners and admins always see every mailbox.">
            <MailboxAccessGrid grid={grid} />
          </SectionCard>
        ) : null}
      </SettingsPage>
    </PageShell>
  );
}
