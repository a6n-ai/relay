import { eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";
import { senderDomainJoin, verifiedSenderWhere } from "./sending-domain";
import { ensureWorkspaceProfile } from "./workspace-profile";
import { DEFAULT_MONTHLY_QUOTA } from "../shared/limits";

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

// fetchedAt 0 is the "no snapshot and no D1 answer" value. Queued mail is never failed for an outage: a campaign run step throws so
// its Workflow retries, and a send claim answers busy for 60 seconds. Both callers ask this one question.
export const noLimitsSnapshot = (limits: WorkspaceLimits): boolean => limits.fetchedAt === 0;

// A missing security row is suspended: a DO never sends for a workspace central does not know.
export async function loadWorkspaceLimits(env: Env, workspaceId: string): Promise<WorkspaceLimits> {
  const [ws] = await securityDb(env).select({ status: workspace.status }).from(workspace).where(eq(workspace.id, workspaceId));
  if (ws) await ensureWorkspaceProfile(env, workspaceId);
  const [profile] = await coreDb(env)
    .select({ quota: workspaceProfile.monthlyMessageQuota, postalAddress: workspaceProfile.physicalAddress })
    .from(workspaceProfile)
    .where(eq(workspaceProfile.workspaceId, workspaceId));
  const rows = await coreDb(env)
    .select({ email: address.email, appId: address.appId, name: address.displayName, replyTo: address.replyTo, sesRegion: sendingDomain.sesRegion })
    .from(address)
    .innerJoin(sendingDomain, senderDomainJoin)
    .where(verifiedSenderWhere(workspaceId));
  return {
    monthlyQuota: profile?.quota ?? DEFAULT_MONTHLY_QUOTA,
    postalAddress: profile?.postalAddress ?? null,
    status: ws?.status ?? "suspended",
    senders: Object.fromEntries(rows.map((r) => [r.email, { appId: r.appId, name: r.name, replyTo: r.replyTo, sesRegion: r.sesRegion }])),
    fetchedAt: Date.now(),
  };
}
