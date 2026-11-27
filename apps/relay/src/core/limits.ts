import { and, eq, sql } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";
import { clientFor } from "./messages";
import { ensureWorkspaceProfile } from "./workspace-profile";

export const DEFAULT_MONTHLY_QUOTA = 10_000;
export const LIMITS_TTL_MS = 300_000;
// A sender miss refreshes only once the snapshot is older than this, so a bad from cannot force a D1 read per send.
export const SENDER_RETRY_MS = 60_000;
// v2 added senders[].appId; a v1 snapshot would refuse every send until it expired.
export const LIMITS_KEY = "limits:v2";

export type WorkspaceLimits = {
  monthlyQuota: number;
  postalAddress: string | null;
  status: "active" | "suspended";
  senders: Record<string, { appId: string; name: string | null; replyTo?: string | null; sesRegion: string }>;
  fetchedAt: number;
};

// A missing security row is suspended: a DO never sends for a workspace central does not know.
export async function loadWorkspaceLimits(env: Env, workspaceId: string): Promise<WorkspaceLimits> {
  const [ws] = await securityDb(env).select({ status: workspace.status }).from(workspace).where(eq(workspace.id, workspaceId));
  if (ws) await ensureWorkspaceProfile(env, workspaceId);
  const [profile] = await coreDb(env)
    .select({ quota: workspaceProfile.monthlyMessageQuota, postalAddress: workspaceProfile.physicalAddress })
    .from(workspaceProfile)
    .where(eq(workspaceProfile.workspaceId, workspaceId));
  // Same workspace on both sides of the join: a domain in another workspace never verifies this address.
  const rows = await coreDb(env)
    .select({ email: address.email, appId: address.appId, name: address.displayName, replyTo: address.replyTo, sesRegion: sendingDomain.sesRegion })
    .from(address)
    .innerJoin(
      sendingDomain,
      and(
        eq(sendingDomain.workspaceId, address.workspaceId),
        eq(sendingDomain.domain, sql`substr(${address.email}, instr(${address.email}, '@') + 1)`),
      ),
    )
    .where(and(eq(address.workspaceId, workspaceId), eq(address.canSend, true), eq(sendingDomain.status, "verified")));
  return {
    monthlyQuota: profile?.quota ?? DEFAULT_MONTHLY_QUOTA,
    postalAddress: profile?.postalAddress ?? null,
    status: ws?.status ?? "suspended",
    senders: Object.fromEntries(rows.map((r) => [r.email, { appId: r.appId, name: r.name, replyTo: r.replyTo, sesRegion: r.sesRegion }])),
    fetchedAt: Date.now(),
  };
}

// A failed refresh is not fatal: the DO's 5-minute TTL is the backstop. Logs carry ids only.
export async function refreshWorkspaceLimits(env: Env, workspaceId: string): Promise<void> {
  try {
    await clientFor(env, workspaceId).refreshLimits(workspaceId);
  } catch {
    console.error("refreshLimits failed", workspaceId);
  }
}
