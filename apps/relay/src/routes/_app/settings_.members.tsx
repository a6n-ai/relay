import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Users } from "lucide-react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { type OrgRole, ROLE_LABEL } from "../../shared/roles";
import { confirmAction } from "../../components/run-action";
import { ChangeRoleDialog } from "../../components/settings/change-role-dialog";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchPeople, removeMemberFn } from "../../console/members.fns";


export const Route = createFileRoute("/_app/settings_/members")({
  staticData: { title: "Members", copy: "People in this workspace and what they can do." },
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loader: () => fetchPeople(),
  pendingComponent: () => <ListSkeleton columns={3} search action />,
  component: MembersPage,
});

function MembersPage() {
  const people = Route.useLoaderData();
  const [q, setQ] = useUrlFilter("q");
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const suspended = shell.active?.status === "suspended";
  const ownerActor = (shell.active?.roles ?? []).includes("owner");
  const canManage = useCan({ member: ["update"] });
  const canRemove = useCan({ member: ["delete"] });
  const [removing, setRemoving] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const confirm = (action: () => Promise<unknown>, success: string) => confirmAction(action, success, () => router.invalidate());

  if (!people) {
    return (
      <>
        <PageHeader />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const needle = q.trim().toLowerCase();
  const rows = needle ? people.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(needle)) : people.members;

  const changingMember = people.members.find((m) => m.id === changing);
  const removingMember = people.members.find((m) => m.id === removing);

  return (
    <>
      <PageHeader />
      {suspended ? <SuspendedNotice /> : null}
      <Toolbar
        search={
          <SearchInput
            value={q}
            placeholder="Search members"
            onChange={setQ}
          />
        }
      />
      <ResourceTable
        columns={[
          { header: "Name", cell: (m) => m.name },
          { header: "Email", kind: "mono", cell: (m) => m.email },
          {
            header: "Role",
            cell: (m) => m.roles.map((r) => ROLE_LABEL[r as OrgRole]).join(", "),
          },
        ]}
        rows={rows}
        rowKey={(m) => m.id}
        empty={
          <EmptyState
            icon={Users}
            title={needle ? "No members match" : "No members yet"}
            description={needle ? "Try a different name or email." : "Invite people to share this workspace."}
          />
        }
        menu={(m) => [
          {
            label: "Change role",
            hidden: !canManage || (!ownerActor && m.roles.includes("owner")),
            onSelect: () => setChanging(m.id),
          },
          { label: "Remove member", destructive: true, hidden: !canRemove, onSelect: () => setRemoving(m.id) },
        ]}
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
    </>
  );
}
