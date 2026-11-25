import { Badge } from "@foundry/ui/badge";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MailPlus } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EmptyState } from "../../components/page/empty-state";
import { Toolbar } from "../../components/page/toolbar";
import { ResourceTable } from "../../components/resource-table";
import { type MemberRole, ROLE_LABEL } from "../../components/role-select";
import { runAction } from "../../components/run-action";
import { InviteForm } from "../../components/settings/invite-form";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { useNewParam } from "../../components/shell/create-menu";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { cancelInviteFn, fetchPeople } from "../../console/members.fns";
import { formatDate } from "../../lib/format-date";

const crumbs = [{ label: "Settings", to: "/settings" }, { label: "Invites" }];

export const Route = createFileRoute("/_app/settings_/invites")({
  validateSearch: (search: Record<string, unknown>): { new?: 1 } => ({
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loader: () => fetchPeople(),
  component: InvitesPage,
});

function InviteStatus({ status }: { status: string }) {
  if (status === "pending") return <StatusBadge status="pending" />;
  if (status === "canceled") return <StatusBadge status="cancelled" />;
  if (status === "accepted") return <Badge variant="success">Accepted</Badge>;
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
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());

  if (!people) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  const invite = canInvite ? (
    <CreateDialog trigger="Invite member" title="Invite a member" open={open} onOpenChange={setOpen}>
      {(done) => <InviteForm done={done} canGrantOwner={ownerActor} />}
    </CreateDialog>
  ) : null;

  return (
    <>
      <PageHeader crumbs={crumbs} />
      {suspended ? <SuspendedNotice /> : null}
      <Toolbar>{invite}</Toolbar>
      <ResourceTable
        columns={[
          { header: "Email", cell: (i) => <span className="font-mono text-xs">{i.email}</span> },
          { header: "Role", cell: (i) => ROLE_LABEL[i.role as MemberRole] ?? i.role },
          { header: "Status", cell: (i) => <InviteStatus status={i.status} /> },
          { header: "Expires", cell: (i) => formatDate(i.expiresAt) },
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
        title="Cancel this invite?"
        description="The link stops working. You can invite them again later."
        confirmLabel="Cancel invite"
        onConfirm={() => {
          const id = cancelling;
          if (id) void run(() => cancelInviteFn({ data: { id } }), "Invite cancelled");
        }}
      />
    </>
  );
}
