import { and, count, eq, gte } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { invitation, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { DAY_MS } from "../shared/limits";

export const INVITES_PER_DAY = 20;
export const SELF_SERVE_WORKSPACE_CAP = 3;
export const SELF_SERVE_QUOTA = 100;
export const SELF_SERVE_APP_CAP = 1;
export const SELF_SERVE_DOMAIN_CAP = 3;

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

// The one write path for profile settings: repairs a missing row first, then stamps updatedAt.
export async function updateWorkspaceProfile(
  env: Env,
  workspaceId: string,
  patch: Partial<Omit<typeof workspaceProfile.$inferInsert, "workspaceId" | "updatedAt">>,
): Promise<void> {
  await ensureWorkspaceProfile(env, workspaceId);
  await coreDb(env)
    .update(workspaceProfile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaceProfile.workspaceId, workspaceId));
}

// Counts creations, not current ownership: a user who adds a second owner and leaves cannot create again.
export async function countSelfServeCreatedBy(env: Env, userId: string): Promise<number> {
  const rows = await coreDb(env)
    .select({ workspaceId: workspaceProfile.workspaceId })
    .from(workspaceProfile)
    .where(and(eq(workspaceProfile.createdBy, userId), eq(workspaceProfile.selfServe, true)));
  return rows.length;
}

// Cancelled rows still count, so cancelling does not free a slot.
export async function invitesInWindow(env: Env, workspaceId: string): Promise<number> {
  const [row] = await securityDb(env)
    .select({ n: count() })
    .from(invitation)
    .where(and(eq(invitation.organizationId, workspaceId), gte(invitation.createdAt, new Date(Date.now() - DAY_MS))));
  return row.n;
}

export async function inviteCap(env: Env, workspaceId: string): Promise<number> {
  return (await getWorkspaceProfile(env, workspaceId)).invitesPerDay ?? INVITES_PER_DAY;
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
