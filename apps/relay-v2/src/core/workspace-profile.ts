import { and, eq, inArray } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { member, workspace } from "../db/security/schema";
import type { Env } from "../env";

export const SELF_SERVE_WORKSPACE_CAP = 3;
export const SELF_SERVE_QUOTA = 100;
export const SELF_SERVE_APP_CAP = 1;

// Only an explicit selfServe: false gets the column defaults. A missing init (repair-on-read) fails closed as self-serve.
export async function ensureWorkspaceProfile(env: Env, workspaceId: string, init?: { selfServe: boolean }): Promise<void> {
  const selfServe = init?.selfServe !== false;
  await coreDb(env)
    .insert(workspaceProfile)
    .values(selfServe ? { workspaceId, selfServe, monthlyMessageQuota: SELF_SERVE_QUOTA } : { workspaceId })
    .onConflictDoNothing();
}

// Owner memberships live in security and self_serve in core, so this is two reads, not one join.
export async function countSelfServeOwned(env: Env, userId: string): Promise<number> {
  const owned = await securityDb(env)
    .select({ workspaceId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  const ownerIds = owned.filter((m) => m.role.split(",").map((r) => r.trim()).includes("owner")).map((m) => m.workspaceId);
  if (ownerIds.length === 0) return 0;
  const rows = await coreDb(env)
    .select({ workspaceId: workspaceProfile.workspaceId })
    .from(workspaceProfile)
    .where(and(inArray(workspaceProfile.workspaceId, ownerIds), eq(workspaceProfile.selfServe, true)));
  return rows.length;
}

// Repairs a profile lost between the organization write and its afterCreate hook, or deleted later.
export async function getWorkspaceProfile(env: Env, workspaceId: string) {
  const [ws] = await securityDb(env).select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId));
  if (!ws) throw new Error("workspace not found");
  await ensureWorkspaceProfile(env, workspaceId);
  const [row] = await coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, workspaceId));
  return row;
}

export async function recordDoState(
  env: Env,
  workspaceId: string,
  state: { doSchemaVersion?: number; doMigrateError?: string | null },
): Promise<boolean> {
  // A DO woken for an id relay-security never created must not leave a profile row behind.
  const [ws] = await securityDb(env).select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId));
  if (!ws) return false;
  await coreDb(env)
    .insert(workspaceProfile)
    .values({ workspaceId, ...state })
    .onConflictDoUpdate({ target: workspaceProfile.workspaceId, set: { ...state, updatedAt: new Date() } });
  return true;
}
