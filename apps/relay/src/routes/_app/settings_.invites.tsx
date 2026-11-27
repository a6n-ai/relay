import { Badge } from "@foundry/ui/badge";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MailPlus } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { CreateDialog } from "../../components/page/create-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/page/resource-table";
import { type OrgRole, ROLE_LABEL } from "../../shared/roles";
import { confirmAction } from "../../components/lib/run-action";
import { InviteForm } from "../../components/settings/invite-form";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { useNewParam } from "../../components/shell/scope";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/page/status-badge";
import { useCan } from "../../components/lib/use-can";
import { cancelInviteFn, fetchPeople } from "../../console/members.fns";
import { formatDate } from "../../components/lib/format-date";


export const Route = createFileRoute("/_app/settings_/invites")({
  staticData: { title: "Invites", copy: "People you have asked to join this workspace." },
  validateSearch: (search: Record<string, unknown>): { new?: 1 } => ({
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loader: () => fetchPeople(),
  pendingComponent: () => <ListSkeleton columns={4} action />,
  component: InvitesPage,
});

function InviteStatus({ status }: { status: string }) {
  if (status === "pending") return <StatusBadge status="pending" />;
  if (status === "canceled") return <StatusBadge status="cancelled" />;
  if (status === "accepted" || status === "expired") return <StatusBadge status={status} />;
  return <Badge variant="neutral">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function InvitesPage() {
  const people = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const [open, setOpen] = useNewParam();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const suspended = shell.active?.status === "suspended";
  const ownerActor = (shell.active?.roles ?? []).includes("owner");
  const canInvite = useCan({ invitation: ["create"] });
  const canCancel = useCan({ invitation: ["cancel"] });
  const confirm = (action: () => Promise<unknown>, success: string) => confirmAction(action, success, () => router.invalidate());

  if (!people) {
    return <PageDenied />;
  }

  const cancellingInvite = people.invites.find((i) => i.id === cancelling);
  const invite = canInvite ? (
    <CreateDialog trigger="Invite member" title="Invite member" open={open} onOpenChange={setOpen}>
      {(done) => <InviteForm done={done} canGrantOwner={ownerActor} />}
    </CreateDialog>
  ) : null;

  return (
    <>
      <PageHeader actions={invite} />
      {suspended ? <SuspendedNotice /> : null}
      <ResourceTable
        columns={[
          { header: "Email", kind: "mono", cell: (i) => i.email },
          { header: "Role", secondary: true, cell: (i) => ROLE_LABEL[i.role as OrgRole] ?? i.role },
          { header: "Status", cell: (i) => <InviteStatus status={i.status} /> },
          { header: "Expires", secondary: true, cell: (i) => formatDate(i.expiresAt) },
        ]}
        rows={people.invites}
        rowKey={(i) => i.id}
        empty={
          <EmptyState
            icon={MailPlus}
            title="No invites yet"
            description="Invite someone by email to share this workspace."
          />
        }
        menu={(i) => [{ label: "Cancel invite", destructive: true, hidden: !canCancel || i.status !== "pending", onSelect: () => setCancelling(i.id) }]}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancel the invite for ${cancellingInvite?.email ?? "this person"}?`}
        description="The link stops working. You can invite them again later."
        confirmLabel="Cancel invite"
        dismissLabel="Keep invite"
        onConfirm={async () => {
          const id = cancelling;
          if (id) await confirm(() => cancelInviteFn({ data: { id } }), "Invite cancelled");
        }}
      />
    </>
  );
}
