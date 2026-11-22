import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization as organizationTable } from "@/db/schema";

// Workspaces made by anyone other than a6n staff start small; Clients-page limits are set after creation.
const SELF_SERVE_WORKSPACE_CAP = 3;

export function canCreateSelfServeWorkspace(platformRole: string | null, ownedSelfServeCount: number): boolean {
  if (platformRole === "super_admin") return true;
  return ownedSelfServeCount < SELF_SERVE_WORKSPACE_CAP;
}

const INVITES_PER_DAY = 20;

/** Counts every invitation the workspace created in the last 24h, whatever its status. */
export function inviteCapReached(countLast24h: number): boolean {
  return countLast24h >= INVITES_PER_DAY;
}

// New rows default to limited (1 app, 100 sends, selfServe). Only a6n staff get unlimited, and only if this update lands.
export async function applyStaffWorkspaceLimits(orgId: string, platformRole: string | null): Promise<void> {
  if (platformRole !== "super_admin") return;
  await db
    .update(organizationTable)
    .set({ maxApps: 0, monthlyMessageQuota: 0, selfServe: false })
    .where(eq(organizationTable.id, orgId));
}
