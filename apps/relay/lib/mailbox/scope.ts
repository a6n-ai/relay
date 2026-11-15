import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { getActiveOrganizationId } from "@/lib/auth/active-org";
import { getSession } from "@/lib/auth/session";
import { tenantsService } from "@/lib/services/tenants.service";
import { PLATFORM_WORKSPACE_SLUG } from "./platform-workspace";

export { PLATFORM_WORKSPACE_SLUG } from "./platform-workspace";

export type MailboxScope = {
  organizationId: string;
  tenantIds: bigint[];
  includeOperatorMail: boolean;
};

export const workspaceSlug = cache(async (): Promise<{ id: string; slug: string } | null> => {
  const id = await getActiveOrganizationId();
  if (!id) return null;
  const session = await getSession();
  if (!session?.user) return null;
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(organization.id, id), eq(users.publicId, session.user.id)))
    .limit(1);
  return row ?? null;
});

export const platformWorkspaceId = cache(async (): Promise<string | null> => {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, PLATFORM_WORKSPACE_SLUG))
    .limit(1);
  return row?.id ?? null;
});

// Shared by the mailbox scope and the compose From list so both see the same apps.
export const MAILBOX_TENANT_LIMIT = 1000;

export async function mailboxScope(): Promise<MailboxScope> {
  const workspace = await workspaceSlug();
  if (!workspace) throw new NotFoundError("No active workspace");
  const page = await tenantsService.listRecent(undefined, MAILBOX_TENANT_LIMIT);
  return {
    organizationId: workspace.id,
    tenantIds: page.items.map((t) => t.id),
    includeOperatorMail: workspace.slug === PLATFORM_WORKSPACE_SLUG,
  };
}

export function inScope(row: { tenantId: bigint | null }, scope: MailboxScope): boolean {
  if (row.tenantId === null) return scope.includeOperatorMail;
  return scope.tenantIds.includes(row.tenantId);
}
