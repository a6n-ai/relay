import { eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";

export async function ensureWorkspaceProfile(env: Env, workspaceId: string): Promise<void> {
  await coreDb(env).insert(workspaceProfile).values({ workspaceId }).onConflictDoNothing();
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
): Promise<void> {
  await coreDb(env)
    .insert(workspaceProfile)
    .values({ workspaceId, ...state })
    .onConflictDoUpdate({ target: workspaceProfile.workspaceId, set: { ...state, updatedAt: new Date() } });
}
