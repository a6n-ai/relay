import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { ResourceTable } from "../../components/resource-table";
import { type MemberRole, ROLE_LABEL, RoleSelect } from "../../components/role-select";
import { ViewHeader } from "../../components/view-header";
import {
  cancelInviteFn,
  changeRoleFn,
  createTeamFn,
  deleteTeamFn,
  fetchPeople,
  inviteMemberFn,
  removeMemberFn,
  setTeamMemberFn,
} from "../../console/members.fns";
import { allows } from "../../lib/auth/permissions";

export const Route = createFileRoute("/_app/members")({
  loader: () => fetchPeople(),
  component: MembersPage,
});

type Person = { id: string; name: string; email: string; roles: MemberRole[] };
type Team = { id: string; name: string; memberIds: string[] };

function MembersPage() {
  const people = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const roles = shell.active?.roles ?? [];
  const suspended = shell.active?.status === "suspended";
  const can = (need: Record<string, string[]>) => !suspended && allows(roles, need);
  const ownerActor = roles.includes("owner");
  const canManage = can({ member: ["update"] });
  const canRemove = can({ member: ["delete"] });
  const canInvite = can({ invitation: ["create"] });
  const canCancel = can({ invitation: ["cancel"] });
  const canCreateTeam = can({ team: ["create"] });
  const canEditTeam = can({ team: ["update"] });
  const canDeleteTeam = can({ team: ["delete"] });
  const namesById = new Map(people.members.map((m) => [m.id, m.name]));

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <>
      <ViewHeader title="Members" />
      {suspended ? (
        <p role="status" className="border-b px-4 py-3 text-sm text-muted-foreground">
          Members, invites and teams are read-only while the workspace is suspended.
        </p>
      ) : null}
      <Tabs defaultValue="members">
        <TabsList className="mx-4 my-2">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <ResourceTable
            columns={[
              { header: "Name", cell: (m) => m.name },
              { header: "Email", cell: (m) => <span className="font-mono text-xs">{m.email}</span> },
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
                    m.roles.map((r) => ROLE_LABEL[r]).join(", ")
                  ),
              },
              {
                header: "",
                cell: (m) =>
                  canRemove ? (
                    <ConfirmDialog
                      trigger="Remove"
                      title="Remove this member?"
                      description="They lose access to this workspace and its apps."
                      confirmLabel="Remove member"
                      onConfirm={() => run(() => removeMemberFn({ data: { memberId: m.id } }), "Member removed")}
                    />
                  ) : null,
              },
            ]}
            rows={people.members}
            rowKey={(m) => m.id}
            empty="No members yet."
          />
        </TabsContent>

        <TabsContent value="invites">
          <div className="flex h-11 items-center justify-end gap-2 border-b px-4">
            {canInvite ? (
              <CreateDialog trigger="Invite member" title="Invite a member">
                {(done) => <InviteForm done={done} canGrantOwner={ownerActor} />}
              </CreateDialog>
            ) : null}
          </div>
          <ResourceTable
            columns={[
              { header: "Email", cell: (i) => <span className="font-mono text-xs">{i.email}</span> },
              { header: "Role", cell: (i) => ROLE_LABEL[i.role as MemberRole] ?? i.role },
              { header: "Status", cell: (i) => i.status },
              { header: "Expires", cell: (i) => new Date(i.expiresAt).toLocaleDateString() },
              {
                header: "",
                cell: (i) =>
                  canCancel && i.status === "pending" ? (
                    <ConfirmDialog
                      trigger="Cancel"
                      title="Cancel this invite?"
                      description="The link stops working. You can invite them again later."
                      confirmLabel="Cancel invite"
                      onConfirm={() => run(() => cancelInviteFn({ data: { id: i.id } }), "Invite cancelled")}
                    />
                  ) : null,
              },
            ]}
            rows={people.invites}
            rowKey={(i) => i.id}
            empty="No invites yet."
          />
        </TabsContent>

        <TabsContent value="teams">
          <div className="flex h-11 items-center justify-end gap-2 border-b px-4">
            {canCreateTeam ? (
              <CreateDialog trigger="New team" title="New team">
                {(done) => <NewTeamForm done={done} />}
              </CreateDialog>
            ) : null}
          </div>
          <ResourceTable
            columns={[
              { header: "Team", cell: (t) => t.name },
              {
                header: "Members",
                cell: (t) => t.memberIds.map((id) => namesById.get(id)).filter(Boolean).join(", ") || "None",
              },
              {
                header: "",
                cell: (t) => (
                  <div className="flex justify-end gap-2">
                    {canEditTeam ? (
                      <TeamMembersDialog
                        team={t}
                        people={people.members}
                        onToggle={(memberId, on) =>
                          run(() => setTeamMemberFn({ data: { teamId: t.id, memberId, on } }), on ? "Added to team" : "Removed from team")
                        }
                      />
                    ) : null}
                    {canDeleteTeam ? (
                      <ConfirmDialog
                        trigger="Delete"
                        title="Delete this team?"
                        description="Members stay in the workspace; only the team goes."
                        confirmLabel="Delete team"
                        onConfirm={() => run(() => deleteTeamFn({ data: { teamId: t.id } }), "Team deleted")}
                      />
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={people.teams}
            rowKey={(t) => t.id}
            empty="No teams yet."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function TeamMembersDialog({
  team,
  people,
  onToggle,
}: {
  team: Team;
  people: Person[];
  onToggle: (memberId: string, on: boolean) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Members</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team.name}</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-3">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{p.name}</span>
              <Switch
                checked={team.memberIds.includes(p.id)}
                onCheckedChange={(on) => onToggle(p.id, on)}
                aria-label={`${p.name} in ${team.name}`}
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ done, canGrantOwner }: { done: () => void; canGrantOwner: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await inviteMemberFn({ data: { email, role } });
      toast.success("Invite sent", { description: email });
      done();
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="invite-email">Email</Label>
      <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="invite-role">Role</Label>
      <RoleSelect id="invite-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Send invite
        </Button>
      </div>
    </form>
  );
}

function NewTeamForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createTeamFn({ data: { name } });
      toast.success("Team created", { description: name });
      done();
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the team.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="team-name">Name</Label>
      <Input id="team-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create team
        </Button>
      </div>
    </form>
  );
}
