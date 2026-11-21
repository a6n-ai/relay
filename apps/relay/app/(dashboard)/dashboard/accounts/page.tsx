import { asc, eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { EmptyState } from "@/components/ds/empty-state";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { activeMember, can, requirePagePermission } from "@/lib/auth/guards";
import { parseRoles } from "@/lib/auth/member-rules";
import { isPlatformAdmin } from "@/lib/auth/org-scope";
import { ROLE_LABELS, orgRoles } from "@/lib/auth/permissions";
import { SectionTabs } from "@/components/ds/section-tabs";
import { SECTION_LABELS } from "@/components/ds/section-labels";
import { MemberRowActions } from "./member-row-actions";
import type { RoleOption } from "./member-roles-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default async function AccountsPage() {
  await requirePagePermission({ staff: ["read"] });
  const actor = await activeMember();
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
      memberPublicId: member.publicId,
      role: member.role,
      memberStatus: member.status,
      email: users.email,
      name: users.name,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(users.email));

  const [canUpdate, canDelete] = await Promise.all([
    can({ member: ["update"] }),
    can({ member: ["delete"] }),
  ]);
  const actorIsOwner = parseRoles(actor?.role ?? "").includes("owner");
  const roleOptions: RoleOption[] = (Object.keys(orgRoles) as (keyof typeof orgRoles)[]).map((key) => ({
    value: key,
    label: ROLE_LABELS[key].label,
    description: ROLE_LABELS[key].description,
    disabled: key === "owner" && !actorIsOwner,
  }));

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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pt-2">
        <p className="text-sm text-muted-foreground text-pretty">People in {workspaceLabel}.</p>
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
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isSelf = r.memberId === actor?.id;
                  const roles = parseRoles(r.role);
                  const lockedOwner = roles.includes("owner") && !actorIsOwner;
                  return (
                    <TableRow key={r.memberPublicId}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          {r.name || r.email}
                          {isSelf ? <Badge variant="outline">You</Badge> : null}
                        </span>
                        {r.name ? <span className="block text-xs text-muted-foreground">{r.email}</span> : null}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {roles.map((role) => (
                            <Badge key={role} variant="outline">
                              {ROLE_LABELS[role as keyof typeof orgRoles]?.label ?? role}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(r.memberStatus)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isSelf && !lockedOwner && (canUpdate || canDelete) ? (
                          <MemberRowActions
                            memberPublicId={r.memberPublicId}
                            name={r.name || r.email}
                            status={r.memberStatus === "suspended" ? "suspended" : "active"}
                            roles={roles}
                            roleOptions={roleOptions}
                            canUpdate={canUpdate}
                            canDelete={canDelete}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
