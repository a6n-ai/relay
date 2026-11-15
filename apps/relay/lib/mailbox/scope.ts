import { cache } from "react";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { getActiveOrganizationId } from "@/lib/auth/active-org";
import { tenantsService } from "@/lib/services/tenants.service";

export const PLATFORM_WORKSPACE_SLUG = "a6n";

export type MailboxScope = {
  organizationId: string;
  tenantIds: bigint[];
  includeOperatorMail: boolean;
};

export const workspaceSlug = cache(async (): Promise<{ id: string; slug: string } | null> => {
  const id = await getActiveOrganizationId();
  if (!id) return null;
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, id))
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

export async function mailboxScope(): Promise<MailboxScope> {
  const workspace = await workspaceSlug();
  if (!workspace) throw new NotFoundError("No active workspace");
  const page = await tenantsService.listRecent(undefined, 1000);
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
