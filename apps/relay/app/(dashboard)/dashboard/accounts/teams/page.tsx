import { and, asc, eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { member, team, teamMember, users } from "@/db/schema";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { TeamTabs } from "../team-tabs";
import {
  AddTeamMemberForm,
  CreateTeamForm,
  DeleteTeamDialog,
  RemoveTeamMemberButton,
  RenameTeamDialog,
} from "./team-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  await requirePagePermission({ staff: ["read"] });
  const organizationId = await requireActiveOrganizationId();

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can({ team: ["create"] }),
    can({ team: ["update"] }),
    can({ team: ["delete"] }),
  ]);

  const teams = await db
    .select({ id: team.id, name: team.name, memberCount: team.memberCount })
    .from(team)
    .where(eq(team.organizationId, organizationId))
    .orderBy(asc(team.name));

  const memberships = await db
    .select({
      teamId: teamMember.teamId,
      memberPublicId: member.publicId,
      name: users.name,
      email: users.email,
    })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .innerJoin(member, and(eq(member.userId, teamMember.userId), eq(member.organizationId, team.organizationId)))
    .innerJoin(users, eq(users.id, teamMember.userId))
    .where(eq(team.organizationId, organizationId))
    .orderBy(asc(users.email));

  const people = await db
    .select({ publicId: member.publicId, name: users.name, email: users.email })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.status, "active")))
    .orderBy(asc(users.email));

  return (
    <PageShell>
      <ViewHeader
        title="Teams"
        tabs={<TeamTabs />}
        actions={
          canCreate ? (
            <CreateDialog label="New team" description="Group people in this workspace.">
              <CreateTeamForm />
            </CreateDialog>
          ) : null
        }
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pt-2">
        {teams.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No teams yet"
            lines={["Teams group people in this workspace.", "Create one to start."]}
          />
        ) : (
          teams.map((t) => {
            const onTeam = memberships.filter((m) => m.teamId === t.id);
            const addable = people
              .filter((p) => !onTeam.some((m) => m.memberPublicId === p.publicId))
              .map((p) => ({ publicId: p.publicId, label: p.name || p.email }));
            return (
              <SettingsSection
                key={t.id}
                title={t.name}
                description={`${t.memberCount} ${t.memberCount === 1 ? "person" : "people"}`}
                action={
                  canUpdate || canDelete ? (
                    <span className="flex items-center gap-1">
                      {canUpdate ? <RenameTeamDialog teamId={t.id} name={t.name} /> : null}
                      {canDelete ? <DeleteTeamDialog teamId={t.id} name={t.name} /> : null}
                    </span>
                  ) : null
                }
              >
                {onTeam.map((m) => (
                  <SettingsRow
                    key={m.memberPublicId}
                    label={m.name || m.email}
                    description={m.name ? m.email : undefined}
                  >
                    {canUpdate ? (
                      <RemoveTeamMemberButton teamId={t.id} memberPublicId={m.memberPublicId} name={m.name || m.email} />
                    ) : null}
                  </SettingsRow>
                ))}
                {canUpdate ? (
                  <SettingsRow label="Add a person">
                    <AddTeamMemberForm teamId={t.id} options={addable} />
                  </SettingsRow>
                ) : null}
              </SettingsSection>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
