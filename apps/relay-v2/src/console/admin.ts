import { asc, count, eq, gte, sql } from "drizzle-orm";
import { refreshWorkspaceLimits, DEFAULT_MONTHLY_QUOTA } from "../core/limits";
import { utcDay } from "../core/usage";
import { ensureWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { usageDaily, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { member, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { ConsoleError } from "./actor";

// shortcut: 100M caps a typo, not a plan; no product number yet, so revisit with the first real quota request.
export const MAX_MONTHLY_QUOTA = 100_000_000;

export type PlatformAdmin = { userId: string };

// Read from D1 only: the sender snapshot in the DO is not the source for an admin's view.
export async function listWorkspaces(env: Env, _admin: PlatformAdmin, now = Date.now()) {
  const d = new Date(now);
  const monthStart = utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const [rows, members, profiles, usage] = await Promise.all([
    securityDb(env)
      .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, status: workspace.status })
      .from(workspace)
      .orderBy(asc(workspace.createdAt)),
    securityDb(env)
      .select({ workspaceId: member.organizationId, n: count() })
      .from(member)
      .groupBy(member.organizationId),
    coreDb(env)
      .select({ workspaceId: workspaceProfile.workspaceId, quota: workspaceProfile.monthlyMessageQuota, selfServe: workspaceProfile.selfServe })
      .from(workspaceProfile),
    coreDb(env)
      .select({ workspaceId: usageDaily.workspaceId, sent: sql<number>`sum(${usageDaily.sent})` })
      .from(usageDaily)
      .where(gte(usageDaily.day, monthStart))
      .groupBy(usageDaily.workspaceId),
  ]);
  const membersBy = new Map(members.map((m) => [m.workspaceId, m.n]));
  const quotaBy = new Map(profiles.map((p) => [p.workspaceId, p.quota]));
  const selfServeBy = new Map(profiles.map((p) => [p.workspaceId, p.selfServe]));
  const sentBy = new Map(usage.map((u) => [u.workspaceId, u.sent]));
  return rows.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    status: ws.status,
    quota: quotaBy.get(ws.id) ?? DEFAULT_MONTHLY_QUOTA,
    selfServe: selfServeBy.get(ws.id) ?? false,
    sentThisMonth: sentBy.get(ws.id) ?? 0,
    members: membersBy.get(ws.id) ?? 0,
  }));
}

async function requireWorkspace(env: Env, workspaceId: string): Promise<void> {
  const [ws] = await securityDb(env).select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId));
  if (!ws) throw new ConsoleError(404, "not found");
}

export async function setWorkspaceStatus(
  env: Env,
  admin: PlatformAdmin,
  workspaceId: string,
  status: "active" | "suspended",
): Promise<void> {
  const rows = await securityDb(env)
    .update(workspace)
    .set({ status, updatedAt: new Date() })
    .where(eq(workspace.id, workspaceId))
    .returning({ id: workspace.id });
  if (rows.length === 0) throw new ConsoleError(404, "not found");
  await writeAudit(env, {
    action: status === "suspended" ? "workspace.suspend" : "workspace.unsuspend",
    actorUserId: admin.userId,
    workspaceId,
    target: workspaceId,
  });
  await refreshWorkspaceLimits(env, workspaceId);
}

// Lifting self-serve keeps the quota; the admin changes it with setWorkspaceQuota.
export async function setSelfServe(env: Env, admin: PlatformAdmin, workspaceId: string, selfServe: boolean): Promise<void> {
  await requireWorkspace(env, workspaceId);
  await ensureWorkspaceProfile(env, workspaceId, { selfServe });
  await coreDb(env)
    .update(workspaceProfile)
    .set({ selfServe, updatedAt: new Date() })
    .where(eq(workspaceProfile.workspaceId, workspaceId));
  await writeAudit(env, { action: "workspace.self_serve", actorUserId: admin.userId, workspaceId, target: workspaceId, data: { selfServe } });
  await refreshWorkspaceLimits(env, workspaceId);
}

// quota 0 means unlimited, matching ClientDO.
export async function setWorkspaceQuota(env: Env, admin: PlatformAdmin, workspaceId: string, quota: number): Promise<void> {
  if (!Number.isInteger(quota) || quota < 0 || quota > MAX_MONTHLY_QUOTA) throw new ConsoleError(400, "invalid quota");
  await requireWorkspace(env, workspaceId);
  await ensureWorkspaceProfile(env, workspaceId);
  await coreDb(env)
    .update(workspaceProfile)
    .set({ monthlyMessageQuota: quota, updatedAt: new Date() })
    .where(eq(workspaceProfile.workspaceId, workspaceId));
  await writeAudit(env, { action: "workspace.quota", actorUserId: admin.userId, workspaceId, target: workspaceId, data: { quota } });
  await refreshWorkspaceLimits(env, workspaceId);
}
