import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization, tenants } from "@/db/schema";
import { quotaExceeded } from "@/lib/tenants/quota";
import { countOrganizationSendsThisMonth, countTenantSendsThisMonth } from "@/lib/tenants/usage";

type Meter = { used: number; quota: number };

/** One drain call: each app and workspace is looked up once, and every allowed send is added to its count. */
export type SendLimitCache = {
  apps: Map<string, Meter & { organizationId: string | null }>;
  workspaces: Map<string, Meter>;
};

/** Counts delivered sends only: a queued row already in the outbox would otherwise count against its own quota. */
export async function checkSendLimits(
  tenantId: bigint | null,
  cache: SendLimitCache = { apps: new Map(), workspaces: new Map() },
): Promise<string | null> {
  if (tenantId === null) return null;

  const appKey = String(tenantId);
  let app = cache.apps.get(appKey);
  if (!app) {
    const [row] = await db
      .select({ organizationId: tenants.organizationId, quota: tenants.monthlyMessageQuota })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!row) return null;
    app = {
      organizationId: row.organizationId,
      quota: row.quota,
      used: await countTenantSendsThisMonth(tenantId),
    };
    cache.apps.set(appKey, app);
  }
  if (quotaExceeded(app.used, app.quota)) return "Monthly message quota exceeded";

  let workspace: Meter | undefined;
  if (app.organizationId) {
    workspace = cache.workspaces.get(app.organizationId);
    if (!workspace) {
      const [org] = await db
        .select({ quota: organization.monthlyMessageQuota })
        .from(organization)
        .where(eq(organization.id, app.organizationId));
      if (org) {
        workspace = {
          quota: org.quota,
          used: await countOrganizationSendsThisMonth(app.organizationId),
        };
        cache.workspaces.set(app.organizationId, workspace);
      }
    }
    if (workspace && quotaExceeded(workspace.used, workspace.quota)) {
      return "Workspace monthly message quota exceeded";
    }
  }

  app.used += 1;
  if (workspace) workspace.used += 1;
  return null;
}
