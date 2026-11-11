import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { PageShell } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { member, organization, tenants, users } from "@/db/schema";
import { getActiveOrganizationId } from "@/lib/auth/active-org";
import { myOrganizationIds, requirePlatformAdmin } from "@/lib/auth/org-scope";
import { countOrganizationSendsThisMonth } from "@/lib/tenants/usage";
import { ClientLimitsForm } from "../client-limits-form";
import { OpenWorkspaceButton } from "../open-workspace-button";

export const dynamic = "force-dynamic";

function formatQuota(n: number) {
  return n === 0 ? "Unlimited" : n.toLocaleString("en");
}

export default async function PlatformClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      monthlyMessageQuota: organization.monthlyMessageQuota,
      maxApps: organization.maxApps,
    })
    .from(organization)
    .where(eq(organization.id, id))
    .limit(1);
  if (!org) notFound();

  const [activeId, mine] = await Promise.all([getActiveOrganizationId(), myOrganizationIds()]);
  const isCurrent = org.id === activeId;
  const isMember = mine.has(org.id);

  const [[appRow], used, people] = await Promise.all([
    db
      .select({ n: count() })
      .from(tenants)
      .where(eq(tenants.organizationId, org.id)),
    countOrganizationSendsThisMonth(org.id),
    db
      .select({ id: member.id, role: member.role, name: users.name, email: users.email })
      .from(member)
      .innerJoin(users, eq(users.id, member.userId))
      .where(eq(member.organizationId, org.id))
      .orderBy(asc(users.email)),
  ]);
  const appCount = Number(appRow?.n) || 0;

  return (
    <PageShell>
      <ViewHeader
        title={org.name}
        subtitle={`${org.slug} · workspace limits for this client. People live under Organization → Team.`}
        actions={isMember && !isCurrent ? <OpenWorkspaceButton organizationId={org.id} /> : null}
        section="organization"
      />
      <SettingsPage
        title={org.name}
        subtitle={
          isCurrent
            ? "This is the workspace you are working in right now."
            : isMember
              ? "Open this client to switch the console into its workspace."
              : "You manage this client's limits. Only its members can open the workspace."
        }
      >
        <SettingsSection title="Status" description="Which client the console is scoped to.">
          <SettingsRow
            label="Active workspace"
            description={
              isCurrent
                ? "You are signed into this client."
                : isMember
                  ? "Open to make this your current client."
                  : "You are not a member of this workspace."
            }
          >
            {isCurrent ? (
              <Badge variant="secondary">Current</Badge>
            ) : isMember ? (
              <OpenWorkspaceButton organizationId={org.id} />
            ) : (
              <Badge variant="outline">No access</Badge>
            )}
          </SettingsRow>
          <SettingsRow
            label="Usage this month"
            description={`${used.toLocaleString("en")} of ${formatQuota(org.monthlyMessageQuota).toLowerCase()} sends · ${appCount} of ${formatQuota(org.maxApps).toLowerCase()} apps`}
          />
        </SettingsSection>

        <SettingsSection
          title="Limits"
          description="0 means no cap. Send count is every app in this workspace for the UTC calendar month."
        >
          <ClientLimitsForm
            organizationId={org.id}
            name={org.name}
            monthlyMessageQuota={org.monthlyMessageQuota}
            maxApps={org.maxApps}
          />
        </SettingsSection>

        <SettingsSection title="People" description="Members of this workspace.">
          {people.length === 0 ? (
            <SettingsRow label="No members yet" />
          ) : (
            people.map((p) => (
              <SettingsRow key={p.id} label={p.name || p.email} description={p.name ? p.email : undefined}>
                <Badge variant="secondary">{p.role}</Badge>
              </SettingsRow>
            ))
          )}
        </SettingsSection>
      </SettingsPage>
    </PageShell>
  );
}
