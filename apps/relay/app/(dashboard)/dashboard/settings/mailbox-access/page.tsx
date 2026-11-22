import Link from "next/link";
import { PageShell } from "@foundry/design-system";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { MailboxAccessGrid } from "@/components/settings/mailbox-access-grid";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { requirePagePermission } from "@/lib/auth/guards";
import { loadAccessGrid } from "@/lib/mailbox/access-grid";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mailbox access" };

export default async function MailboxAccessPage() {
  await requirePagePermission({ mailbox: ["manage"] });
  const grid = await loadAccessGrid(await requireActiveOrganizationId());

  return (
    <PageShell>
      <ViewHeader title="Mailbox access" />
      <SettingsPage title="Mailbox access" subtitle="Owners and admins always see every mailbox.">
        {grid.mailboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mailboxes yet. Add them under <Link href="/dashboard/settings/apps" className="underline">Apps</Link>.
          </p>
        ) : grid.columns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/dashboard/settings/members" className="underline">Invite people or make a team first</Link>.
          </p>
        ) : (
          <MailboxAccessGrid grid={grid} />
        )}
      </SettingsPage>
    </PageShell>
  );
}
