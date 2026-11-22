import { notFound } from "next/navigation";
import { PageShell } from "@foundry/design-system";
import { mailboxKindLabel } from "@/components/ds/plain-labels";
import { SettingsPage, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { canSeeMailbox } from "@/lib/mailbox/access";
import { mailboxScope } from "@/lib/mailbox/scope";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { MailboxSendingForm } from "./mailbox-sending-form";
import { requirePagePermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mailbox" };

export default async function MailboxSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ settings: ["read"] });
  const { id } = await params;
  const scope = await mailboxScope();
  const row = await tenantMailboxesService.read(id).catch(() => null);
  if (!row || !scope.tenantIds.includes(row.tenantId) || !canSeeMailbox(scope.mailboxIds, row.id)) notFound();
  const app = await tenantsService.findById(row.tenantId);
  if (!app) notFound();

  const status = !row.canSend
    ? "Not a From"
    : row.verifiedAt
      ? "Ready to send"
      : "Domain not proven yet: Relay uses the default From";

  return (
    <PageShell>
      <ViewHeader title={row.email} section="settings" />
      <SettingsPage title={row.email} subtitle={`${app.name} · ${mailboxKindLabel(row.kind)}`}>
        <SettingsSection title="Sending" description={status}>
          <MailboxSendingForm
            publicId={row.publicId}
            canSend={row.canSend}
            displayName={row.displayName}
            isPeopleInbox={row.kind === "people_inbox"}
          />
        </SettingsSection>
      </SettingsPage>
    </PageShell>
  );
}
