import { createFileRoute, useRouter } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EmptyState } from "../../components/page/empty-state";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { ResourceTable } from "../../components/resource-table";
import { confirmAction, runAction } from "../../components/run-action";
import { NewTeamForm } from "../../components/settings/new-team-form";
import { SuspendedNotice } from "../../components/settings/suspended-notice";
import { TeamMembersDialog } from "../../components/settings/team-members-dialog";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { deleteTeamFn, fetchPeople, setTeamMemberFn } from "../../console/members.fns";

const crumbs = [{ label: "Settings", to: "/settings" }, { label: "Teams" }];

export const Route = createFileRoute("/_app/settings_/teams")({
  loader: () => fetchPeople(),
  pendingComponent: () => <TableSkeleton columns={2} />,
  component: TeamsPage,
});

function TeamsPage() {
  const people = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const suspended = shell.active?.status === "suspended";
  const canCreateTeam = useCan({ team: ["create"] });
  const canEditTeam = useCan({ team: ["update"] });
  const canDeleteTeam = useCan({ team: ["delete"] });
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
  const namesById = new Map(people.members.map((m) => [m.id, m.name]));
  const editingTeam = people.teams.find((t) => t.id === editing);

  return (
    <>
      <PageHeader crumbs={crumbs} />
      {suspended ? <SuspendedNotice /> : null}
      <Toolbar>
        {canCreateTeam ? (
          <CreateDialog trigger="New team" title="New team">
            {(done) => <NewTeamForm done={done} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      <ResourceTable
        columns={[
          { header: "Team", cell: (t) => t.name },
          {
            header: "Members",
            cell: (t) => t.memberIds.map((id) => namesById.get(id)).filter(Boolean).join(", ") || "—",
          },
        ]}
        rows={people.teams}
        rowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description="Teams group members so you can share an address with all of them."
          />
        }
        menu={(t) => [
          { label: "Members", hidden: !canEditTeam, onSelect: () => setEditing(t.id) },
          { label: "Delete team", destructive: true, hidden: !canDeleteTeam, onSelect: () => setDeleting(t.id) },
        ]}
      />
      {editingTeam ? (
        <TeamMembersDialog
          team={editingTeam}
          people={people.members}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          onToggle={(memberId, on) =>
            run(() => setTeamMemberFn({ data: { teamId: editingTeam.id, memberId, on } }), on ? "Added to team" : "Removed from team")
          }
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this team?"
        description="Members stay in the workspace; only the team goes."
        confirmLabel="Delete team"
        onConfirm={async () => {
          const teamId = deleting;
          if (teamId) await confirm(() => deleteTeamFn({ data: { teamId } }), "Team deleted");
        }}
      />
    </>
  );
}
