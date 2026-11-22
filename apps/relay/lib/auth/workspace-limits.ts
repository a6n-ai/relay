import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization as organizationTable } from "@/db/schema";

// Workspaces made by anyone other than a6n staff start small; Clients-page limits are set after creation.
const SELF_SERVE_WORKSPACE_CAP = 3;

export function canCreateSelfServeWorkspace(platformRole: string | null, ownedSelfServeCount: number): boolean {
  if (platformRole === "super_admin") return true;
  return ownedSelfServeCount < SELF_SERVE_WORKSPACE_CAP;
}

export function selfServeLimits(
  platformRole: string | null,
): { maxApps: number; monthlyMessageQuota: number } | null {
  if (platformRole === "super_admin") return null;
  return { maxApps: 1, monthlyMessageQuota: 100 };
}

export async function applySelfServeLimits(orgId: string, platformRole: string | null): Promise<void> {
  const limits = selfServeLimits(platformRole);
  if (!limits) return;
  await db
    .update(organizationTable)
    .set({ ...limits, selfServe: true })
    .where(eq(organizationTable.id, orgId));
}
