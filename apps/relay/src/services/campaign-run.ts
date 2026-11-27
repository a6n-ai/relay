import { and, eq, sql } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { getWorkspaceProfile } from "../core/workspace-profile";
import { clientFor } from "../do/client";
import type { Env } from "../env";

// Instance ids carry the run, so a re-scheduled campaign never collides with a terminated instance.
export async function stopRun(env: Env, campaignId: string, runSeq: number): Promise<void> {
  try {
    const instance = await env.CAMPAIGNS.get(`${campaignId}-${runSeq}`);
    await instance.terminate();
  } catch {
    // The run already finished, or was never created; the DO state is authoritative either way.
  }
}

// Same join as the send path's sender snapshot: the address's domain must be verified in this workspace.
export async function verifiedSenders(env: Env, workspaceId: string, appId: string): Promise<string[]> {
  const rows = await coreDb(env)
    .select({ email: address.email })
    .from(address)
    .innerJoin(
      sendingDomain,
      and(
        eq(sendingDomain.workspaceId, address.workspaceId),
        eq(sendingDomain.domain, sql`substr(${address.email}, instr(${address.email}, '@') + 1)`),
      ),
    )
    .where(
      and(
        eq(address.workspaceId, workspaceId),
        eq(address.appId, appId),
        eq(address.canSend, true),
        eq(sendingDomain.status, "verified"),
      ),
    );
  return rows.map((r) => r.email);
}

// The one scheduling path: the console and the API both call it. The caller maps each refusal to its own error.
export async function startCampaignRun(env: Env, workspaceId: string, id: string, at: number) {
  const profile = await getWorkspaceProfile(env, workspaceId);
  const client = clientFor(env, workspaceId);
  const outcome = await client.scheduleCampaign(workspaceId, id, at, profile.physicalAddress ?? null);
  if (outcome === "missing" || outcome === "not_draft" || "problems" in outcome) return outcome;
  try {
    await env.CAMPAIGNS.create({
      id: `${id}-${outcome.runSeq}`,
      params: { workspaceId, campaignId: id, runSeq: outcome.runSeq, at },
    });
  } catch {
    await client.unscheduleCampaign(workspaceId, id);
    return "could_not_schedule" as const;
  }
  return outcome;
}
