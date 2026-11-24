import { and, eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";

export const SELF_SERVE_WORKSPACE_CAP = 3;
export const SELF_SERVE_QUOTA = 100;
export const SELF_SERVE_APP_CAP = 1;

// Only an explicit selfServe: false gets the column defaults. A missing init (repair-on-read) fails closed as self-serve.
export async function ensureWorkspaceProfile(
  env: Env,
  workspaceId: string,
  init?: { selfServe: boolean; createdBy?: string },
): Promise<void> {
  const selfServe = init?.selfServe !== false;
  await coreDb(env)
    .insert(workspaceProfile)
    .values(
      selfServe
        ? { workspaceId, selfServe, monthlyMessageQuota: SELF_SERVE_QUOTA, createdBy: init?.createdBy }
        : { workspaceId, createdBy: init?.createdBy },
    )
    .onConflictDoNothing();
}

// Counts creations, not current ownership: a user who adds a second owner and leaves cannot create again.
export async function countSelfServeCreatedBy(env: Env, userId: string): Promise<number> {
  const rows = await coreDb(env)
    .select({ workspaceId: workspaceProfile.workspaceId })
    .from(workspaceProfile)
    .where(and(eq(workspaceProfile.createdBy, userId), eq(workspaceProfile.selfServe, true)));
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

// Update only: an insert here would give a lost profile the column defaults (not self-serve, 10000) instead of failing closed.
export async function recordDoState(
  env: Env,
  workspaceId: string,
  state: { doSchemaVersion?: number; doMigrateError?: string | null },
): Promise<boolean> {
  const rows = await coreDb(env)
    .update(workspaceProfile)
    .set({ ...state, updatedAt: new Date() })
    .where(eq(workspaceProfile.workspaceId, workspaceId))
    .returning({ workspaceId: workspaceProfile.workspaceId });
  return rows.length > 0;
}
