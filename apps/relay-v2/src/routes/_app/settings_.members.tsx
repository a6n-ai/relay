import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Users } from "lucide-react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { type MemberRole, ROLE_LABEL, RoleSelect } from "../../components/role-select";
import { confirmAction, runAction } from "../../components/run-action";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { changeRoleFn, fetchPeople, removeMemberFn } from "../../console/members.fns";

const crumbs = [{ label: "Settings", to: "/settings" }, { label: "Members" }];

export const Route = createFileRoute("/_app/settings_/members")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loader: () => fetchPeople(),
  pendingComponent: () => <TableSkeleton columns={3} />,
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
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());
  const confirm = (action: () => Promise<unknown>, success: string) => confirmAction(action, success, () => router.invalidate());

  if (!people) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const needle = q.trim().toLowerCase();
  const rows = needle ? people.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(needle)) : people.members;

  return (
    <>
      <PageHeader crumbs={crumbs} />
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
            cell: (m) =>
              canManage && (ownerActor || !m.roles.includes("owner")) ? (
                <RoleSelect
                  id={`role-${m.id}`}
                  value={m.roles[0] ?? "member"}
                  canGrantOwner={ownerActor}
                  onChange={(role) => run(() => changeRoleFn({ data: { memberId: m.id, role } }), "Role updated")}
                />
              ) : (
                m.roles.map((r) => ROLE_LABEL[r as MemberRole]).join(", ")
              ),
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
          { label: "Remove", destructive: true, hidden: !canRemove, onSelect: () => setRemoving(m.id) },
        ]}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this member?"
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
