import { isSesRegion } from "../shared/regions";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { INBOUND_GRACE_MS } from "../core/addresses";
import { clientFor } from "../do/client";
import { refreshWorkspaceLimits } from "./limits";
import { utcDay } from "../core/usage";
import { ensureWorkspaceProfile, SELF_SERVE_QUOTA, updateWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { usageDaily, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app, member, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { INVITES_PER_DAY } from "../core/workspace-profile";
import { RelayError } from "../shared/errors";
import { MAX_INVITES_PER_DAY, MAX_MONTHLY_QUOTA } from "../shared/limits";

// shortcut: 100M caps a typo, not a plan; no product number yet, so revisit with the first real quota request.

type PlatformAdmin = { userId: string };

// Read from D1 only: the sender snapshot in the DO is not the source for an admin's view.
export async function listWorkspaces(env: Env, now = Date.now()) {
  const d = new Date(now);
  const monthStart = utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const [rows, members, profiles, usage] = await Promise.all([
    securityDb(env)
      .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, status: workspace.status, suspendedAt: workspace.suspendedAt })
      .from(workspace)
      .orderBy(asc(workspace.createdAt)),
    securityDb(env)
      .select({ workspaceId: member.organizationId, n: count() })
      .from(member)
      .groupBy(member.organizationId),
    coreDb(env)
      .select({
        workspaceId: workspaceProfile.workspaceId,
        quota: workspaceProfile.monthlyMessageQuota,
        selfServe: workspaceProfile.selfServe,
        invitesPerDay: workspaceProfile.invitesPerDay,
        sesRegion: workspaceProfile.defaultSesRegion,
      })
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
  const invitesBy = new Map(profiles.map((p) => [p.workspaceId, p.invitesPerDay]));
  const regionBy = new Map(profiles.map((p) => [p.workspaceId, p.sesRegion]));
  const sentBy = new Map(usage.map((u) => [u.workspaceId, u.sent]));
  return rows.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    status: ws.status,
    suspendedAt: ws.suspendedAt?.getTime() ?? null,
    inboundUntil: ws.status === "suspended" && ws.suspendedAt ? ws.suspendedAt.getTime() + INBOUND_GRACE_MS : null,
    // Without a row, show what ensureWorkspaceProfile would enforce (fail closed: self-serve, SELF_SERVE_QUOTA).
    quota: quotaBy.get(ws.id) ?? SELF_SERVE_QUOTA,
    selfServe: selfServeBy.get(ws.id) ?? true,
    invitesPerDay: invitesBy.get(ws.id) ?? INVITES_PER_DAY,
    sesRegion: regionBy.get(ws.id) ?? null,
    sentThisMonth: sentBy.get(ws.id) ?? 0,
    members: membersBy.get(ws.id) ?? 0,
  }));
}

async function requireWorkspace(env: Env, workspaceId: string): Promise<void> {
  const [ws] = await securityDb(env).select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId));
  if (!ws) throw new RelayError("not found");
}

export async function setWorkspaceStatus(
  env: Env,
  admin: PlatformAdmin,
  workspaceId: string,
  status: "active" | "suspended",
): Promise<void> {
  const rows = await securityDb(env)
    .update(workspace)
    // A repeat suspend keeps the first suspended_at so the inbound grace window never extends.
    .set({
      status,
      suspendedAt: status === "suspended" ? sql`coalesce(${workspace.suspendedAt}, ${Date.now()})` : null,
      updatedAt: new Date(),
    })
    .where(eq(workspace.id, workspaceId))
    .returning({ id: workspace.id });
  if (rows.length === 0) throw new RelayError("not found");
  await writeAudit(env, {
    action: status === "suspended" ? "workspace.suspend" : "workspace.unsuspend",
    actorUserId: admin.userId,
    workspaceId,
    target: workspaceId,
  });
  await refreshWorkspaceLimits(env, workspaceId);
}

// Null in the profile means the default (INVITES_PER_DAY); this only raises or lowers it for one workspace.
export async function setWorkspaceInviteCap(env: Env, admin: PlatformAdmin, workspaceId: string, cap: number): Promise<void> {
  if (!Number.isInteger(cap) || cap < 1 || cap > MAX_INVITES_PER_DAY) throw new RelayError("invalid input");
  await requireWorkspace(env, workspaceId);
  await updateWorkspaceProfile(env, workspaceId, { invitesPerDay: cap });
  await writeAudit(env, { action: "workspace.invite_cap", actorUserId: admin.userId, workspaceId, target: workspaceId, data: { cap } });
}

// The region new sending domains in this workspace use. Existing domains keep the region they were added with.
export async function setWorkspaceRegion(env: Env, admin: PlatformAdmin, workspaceId: string, region: string): Promise<void> {
  if (!isSesRegion(region)) throw new RelayError("unknown region");
  await requireWorkspace(env, workspaceId);
  await updateWorkspaceProfile(env, workspaceId, { defaultSesRegion: region });
  await writeAudit(env, { action: "workspace.ses_region", actorUserId: admin.userId, workspaceId, target: workspaceId, data: { region } });
}

// quota 0 means unlimited, matching ClientDO.
export async function setWorkspaceQuota(env: Env, admin: PlatformAdmin, workspaceId: string, quota: number): Promise<void> {
  if (!Number.isInteger(quota) || quota < 0 || quota > MAX_MONTHLY_QUOTA) throw new RelayError("invalid quota");
  await requireWorkspace(env, workspaceId);
  await updateWorkspaceProfile(env, workspaceId, { monthlyMessageQuota: quota });
  await writeAudit(env, { action: "workspace.quota", actorUserId: admin.userId, workspaceId, target: workspaceId, data: { quota } });
  await refreshWorkspaceLimits(env, workspaceId);
}

// Super admin only: a binding names a Worker on this deployment, which a tenant must never choose.
export async function setAudienceBindingFor(
  env: Env,
  admin: PlatformAdmin,
  workspaceId: string,
  appId: string,
  binding: string,
): Promise<{ secret: string | null }> {
  const [row] = await securityDb(env)
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.id, appId), eq(app.workspaceId, workspaceId)));
  if (!row) throw new RelayError("not found");
  const result = await clientFor(env, workspaceId).setAudienceHook(workspaceId, appId, { kind: "binding", binding });
  await writeAudit(env, { action: "app.audience_hook.set", actorUserId: admin.userId, workspaceId, target: appId, data: { appId } });
  return result;
}
