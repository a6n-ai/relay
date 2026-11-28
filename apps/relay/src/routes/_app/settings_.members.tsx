import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Users } from "lucide-react";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/page/resource-table";
import { CreateDialog } from "../../components/page/create-dialog";
import { StatusBadge } from "../../components/page/status-badge";
import { type OrgRole, ROLE_LABEL } from "../../shared/roles";
import { confirmAction } from "../../components/lib/run-action";
import { ChangeRoleDialog } from "../../components/settings/change-role-dialog";
import { InviteForm } from "../../components/settings/invite-form";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/lib/use-can";
import { cancelInviteFn, fetchPeople, removeMemberFn } from "../../console/members.fns";
import { fetchDomains } from "../../console/domains.fns";
import { flag, str } from "../../components/lib/route-search";
import { useNewParam } from "../../components/shell/scope";
import { isSuspended } from "../../shared/limits";

export const Route = createFileRoute("/_app/settings_/members")({
  staticData: { title: "Members", copy: "People in this workspace, and people you have invited." },
  validateSearch: (search: Record<string, unknown>): { q?: string; new?: 1 } => ({
    q: str(search.q),
    new: flag(search.new, 1, "1") && 1,
  }),
  loader: async () => ({ people: await fetchPeople(), domains: (await fetchDomains()) ?? [] }),
  pendingComponent: () => <ListSkeleton columns={4} search action />,
  component: MembersPage,
});

// Accepted and cancelled invites are not people to show: the first are members, the second are gone.
type Row =
  | { kind: "member"; id: string; name: string; email: string; role: string; status: "active" }
  | { kind: "invite"; id: string; name: string; email: string; role: string; status: "invited" | "expired" };

function MembersPage() {
  const { people, domains } = Route.useLoaderData();
  const [q, setQ] = useUrlFilter("q");
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const suspended = isSuspended(shell.active?.status);
  const ownerActor = (shell.active?.roles ?? []).includes("owner");
  const canManage = useCan({ member: ["update"] });
  const canRemove = useCan({ member: ["delete"] });
  const canInvite = useCan({ invitation: ["create"] });
  const canCancel = useCan({ invitation: ["cancel"] });
  const [open, setOpen] = useNewParam();
  const [removing, setRemoving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const confirm = (action: () => Promise<unknown>, success: string) => confirmAction(action, success, () => router.invalidate());

  if (!people) {
    return <PageDenied />;
  }
  const all: Row[] = [
    ...people.members.map((m) => ({ kind: "member" as const, id: m.id, name: m.name, email: m.email, role: m.roles.map((r) => ROLE_LABEL[r as OrgRole]).join(", "), status: "active" as const })),
    ...people.invites
      .filter((i) => i.status === "pending" || i.status === "expired")
      .map((i) => ({ kind: "invite" as const, id: i.id, name: "", email: i.email, role: ROLE_LABEL[i.role as OrgRole] ?? i.role, status: i.status === "pending" ? ("invited" as const) : ("expired" as const) })),
  ];
  const needle = q.trim().toLowerCase();
  const rows = needle ? all.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(needle)) : all;

  const changingMember = people.members.find((m) => m.id === changing);
  const removingMember = people.members.find((m) => m.id === removing);
  const cancellingInvite = people.invites.find((i) => i.id === cancelling);

  return (
    <>
      <PageHeader
        actions={
          canInvite && !suspended ? (
            <CreateDialog trigger="Invite member" title="Invite member" open={open} onOpenChange={setOpen}>
              {(done) => <InviteForm done={done} canGrantOwner={ownerActor} domains={domains} apps={shell.apps} />}
            </CreateDialog>
          ) : null
        }
      />
      {suspended ? <SuspendedNotice /> : null}
      <Toolbar search={<SearchInput value={q} placeholder="Search name or email" onChange={setQ} />} />
      <ResourceTable
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Email", kind: "mono", cell: (r) => r.email },
          { header: "Role", cell: (r) => r.role },
          { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        rowKey={(r) => `${r.kind}:${r.id}`}
        empty={
          <EmptyState
            icon={Users}
            title={needle ? "No one matches" : "No members yet"}
            description={needle ? "Try a different name or email." : "Invite people to share this workspace."}
          />
        }
        menu={(r) =>
          r.kind === "invite"
            ? [{ label: "Cancel invite", destructive: true, hidden: !canCancel || r.status !== "invited", onSelect: () => setCancelling(r.id) }]
            : [
                {
                  label: "Change role",
                  hidden: !canManage || (!ownerActor && people.members.find((m) => m.id === r.id)?.roles.includes("owner")),
                  onSelect: () => setChanging(r.id),
                },
                { label: "Remove member", destructive: true, hidden: !canRemove, onSelect: () => setRemoving(r.id) },
              ]
        }
      />
      {changingMember ? (
        <ChangeRoleDialog
          key={changingMember.id}
          member={{ id: changingMember.id, name: changingMember.name, role: (changingMember.roles[0] ?? "member") as OrgRole }}
          canGrantOwner={ownerActor}
          onOpenChange={(o) => !o && setChanging(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removingMember?.name ?? "this member"}?`}
        description="They lose access to this workspace and its apps."
        confirmLabel="Remove member"
        onConfirm={async () => {
          const memberId = removing;
          if (memberId) await confirm(() => removeMemberFn({ data: { memberId } }), "Member removed");
        }}
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
