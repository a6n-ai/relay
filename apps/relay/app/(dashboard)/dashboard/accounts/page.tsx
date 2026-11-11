import { asc, eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { EmptyState } from "@/components/ds/empty-state";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { isPlatformAdmin } from "@/lib/auth/org-scope";
import { getSession } from "@/lib/auth/session";
import { SectionTabs } from "@/components/ds/section-tabs";
import { SECTION_LABELS } from "@/components/ds/section-labels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

type UserStatus = "active" | "inactive" | "suspended" | "deleted";

function statusBadge(status: UserStatus) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "inactive":
      return <Badge variant="outline">Inactive</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "deleted":
      return <Badge variant="destructive">Deleted</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default async function AccountsPage() {
  const session = await getSession();
  const organizationId = await requireActiveOrganizationId();
  const showClients = await isPlatformAdmin();
  const orgTabs = showClients
    ? (["/dashboard/platform", "/dashboard/accounts"] as const)
    : (["/dashboard/accounts"] as const);
  const [org] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  const rows = await db
    .select({
      memberId: member.id,
      role: member.role,
      email: users.email,
      name: users.name,
      status: users.status,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(users.email));

  const workspaceLabel = org?.name ?? "this workspace";

  return (
    <PageShell>
      <ViewHeader
        title="Team"
        tabs={
          <SectionTabs
            section="organization"
            label={SECTION_LABELS.organization}
            include={orgTabs}
          />
        }
      />
      <SettingsPage
        title="Team"
        subtitle={`People in ${workspaceLabel}. Organization → Team for the open workspace.`}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No teammates yet"
            lines={[
              "This workspace has no members yet.",
              "People appear here when they join this client.",
            ]}
            docsHref="/docs"
          />
        ) : (
          <SettingsSection
            title="People in this workspace"
            description={`${rows.length.toLocaleString("en")} in ${org?.slug ?? "workspace"}`}
          >
            {rows.map((r) => (
              <SettingsRow
                key={r.memberId}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {r.name || r.email}
                    {r.email === session?.user.email ? <Badge variant="outline">You</Badge> : null}
                  </span>
                }
                description={`${r.name ? `${r.email} · ` : ""}${r.role} · joined ${new Date(r.createdAt).toLocaleDateString()}`}
              >
                {statusBadge(r.status as UserStatus)}
              </SettingsRow>
            ))}
          </SettingsSection>
        )}
      </SettingsPage>
    </PageShell>
  );
}
