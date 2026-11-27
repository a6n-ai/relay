import { describeError } from "../core/log";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { decodeCursor } from "../core/cursor";
import { sanitizeEmailHtml } from "@relay/email/sanitize";
import { getWorkspaceProfile, updateWorkspaceProfile } from "../core/workspace-profile";
import { securityDb } from "../db/security/client";
import { user as securityUser } from "../db/security/schema";
import type { CampaignPatch, CampaignSummary } from "../do/campaigns";
import { clientFor } from "../do/client";
import type { SendResult } from "../do/types";
import type { Env } from "../env";
import { hasDataToken } from "../shared/campaign-problems";
import { RelayError } from "../shared/errors";
import { DAY_MS } from "../shared/limits";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../shared/merge";
import { type AudiencePreview, type CampaignStats, type CampaignView, type ListView } from "../shared/views";
import { startCampaignRun, stopRun, verifiedSenders } from "./campaign-run";
import { refreshWorkspaceLimits } from "./limits";
import { ownApp, audit, owned, type Principal } from "./principal";
import type { campaignCreateInput } from "./schemas";

// Lets TiffinGrab send staff straight to the editor for a campaign it created or changed.
export const withConsoleUrl = (env: Env, campaign: CampaignView) => ({
  ...campaign,
  consoleUrl: `${env.BETTER_AUTH_URL}/campaigns/${campaign.id}?appId=${campaign.appId}`,
});

async function ownedCampaign(env: Env, p: Principal, id: string): Promise<CampaignView> {
  return owned(p, await clientFor(env, p.workspaceId).getCampaign(p.workspaceId, id));
}

export async function listCampaigns(
  env: Env,
  p: Principal,
  appId: string,
  cursor?: string,
): Promise<{ rows: CampaignSummary[]; nextCursor: string | null }> {
  await ownApp(env, p, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  return clientFor(env, p.workspaceId).listCampaigns(p.workspaceId, cursor, appId);
}

export const getCampaign = ownedCampaign;

export async function campaignStats(env: Env, p: Principal, id: string): Promise<CampaignStats> {
  await ownedCampaign(env, p, id);
  const stats = await clientFor(env, p.workspaceId).campaignStats(p.workspaceId, id);
  if (!stats) throw new RelayError("not found");
  return stats;
}

export async function createCampaign(env: Env, p: Principal, appId: string, input: z.infer<typeof campaignCreateInput>): Promise<CampaignView> {
  await ownApp(env, p, appId);
  const audience = input.audienceKind ? { audienceKind: input.audienceKind, audienceQuery: input.audienceQuery ?? null } : undefined;
  const campaign = await clientFor(env, p.workspaceId).createCampaign(p.workspaceId, appId, input.name, input.templateId, audience);
  if (campaign === "template_missing") throw new RelayError("not found");
  await audit(env, p, "campaign.create", campaign.id, { appId });
  return campaign;
}

// Merge fields and the sender are checked here; the DO checks draft status and list ownership in its own transaction.
export async function updateCampaign(env: Env, p: Principal, id: string, patch: CampaignPatch): Promise<CampaignView> {
  const current = await ownedCampaign(env, p, id);
  if (patch.audienceQuery && patch.audienceQuery.length > 1000) throw new RelayError("invalid input");
  // {{data.*}} is only valid where a hook supplies the data.
  const data = (patch.audienceKind ?? current.audienceKind) === "hook";
  for (const body of [patch.subject, patch.html, patch.text]) {
    if (body !== undefined && unknownMergeFields(body, { data }).length > 0) throw new RelayError("unknown merge field");
  }
  // A hook-to-lists switch keeps the saved bodies, so they are re-checked against the new audience.
  if (patch.audienceKind === "lists" && current.audienceKind === "hook" && [current.html, current.text].some(hasDataToken)) {
    throw new RelayError("campaign not ready", 409, "campaign not ready: data_fields_need_hook");
  }
  if (patch.fromEmail && !(await verifiedSenders(env, p.workspaceId, current.appId)).includes(patch.fromEmail)) {
    throw new RelayError("sender not verified");
  }
  const updated = await clientFor(env, p.workspaceId).updateCampaign(p.workspaceId, id, patch);
  await audit(env, p, "campaign.update", id);
  return updated;
}

export async function deleteCampaign(env: Env, p: Principal, id: string): Promise<void> {
  await ownedCampaign(env, p, id);
  await clientFor(env, p.workspaceId).deleteCampaign(p.workspaceId, id);
  await audit(env, p, "campaign.delete", id);
}

// A hook audience is resolved at send time, so there is no count to preview.
export async function previewAudience(env: Env, p: Principal, id: string): Promise<AudiencePreview | null> {
  const campaign = await ownedCampaign(env, p, id);
  if (campaign.audienceKind === "hook") return null;
  return clientFor(env, p.workspaceId).previewAudience(p.workspaceId, campaign.appId, campaign.listIds, campaign.fromEmail);
}

export async function campaignOptions(
  env: Env,
  p: Principal,
  appId: string,
): Promise<{ senders: string[]; lists: ListView[]; postalAddress: string | null }> {
  await ownApp(env, p, appId);
  const [senders, lists, profile] = await Promise.all([
    verifiedSenders(env, p.workspaceId, appId),
    clientFor(env, p.workspaceId).listLists(p.workspaceId, appId),
    getWorkspaceProfile(env, p.workspaceId),
  ]);
  return { senders, lists, postalAddress: profile.physicalAddress ?? null };
}

// Settings write: the address reaches every campaign body, so the limits snapshot is refreshed at once.
export async function setPostalAddress(env: Env, p: Principal, value: string): Promise<void> {
  await updateWorkspaceProfile(env, p.workspaceId, { physicalAddress: value });
  await refreshWorkspaceLimits(env, p.workspaceId);
  await audit(env, p, "workspace.postal_address", p.workspaceId);
}

// Renders with the sample contact; unsubscribe links point at "#" and the HTML is sanitized as the recipient would see it.
export async function previewHtml(env: Env, p: Principal, id: string): Promise<{ htmlSafe: string; text: string; subject: string }> {
  const campaign = await ownedCampaign(env, p, id);
  return {
    htmlSafe: sanitizeEmailHtml(fillUnsubscribe(renderMerge(campaign.html, MERGE_SAMPLES, "html"), "#")).html,
    text: fillUnsubscribe(renderMerge(campaign.text, MERGE_SAMPLES, "text"), "#"),
    subject: renderMerge(campaign.subject, MERGE_SAMPLES, "subject"),
  };
}

export async function scheduleCampaign(env: Env, p: Principal, id: string, at: number): Promise<{ runSeq: number }> {
  const now = Date.now();
  // Same window for both transports; the console shows its own copy for it, the API keeps the generic one.
  if (at < now - 60_000 || at > now + 365 * DAY_MS) throw new RelayError(p.keyId ? "invalid input" : "invalid schedule");
  await ownedCampaign(env, p, id);
  const outcome = await startCampaignRun(env, p.workspaceId, id, at);
  if (outcome === "could_not_schedule") throw new RelayError("could not schedule");
  if ("problems" in outcome) throw new RelayError("campaign not ready", 409, `campaign not ready: ${outcome.problems.join(", ")}`);
  await audit(env, p, "campaign.schedule", id);
  return { runSeq: outcome.runSeq };
}

export async function unscheduleCampaign(env: Env, p: Principal, id: string): Promise<void> {
  const campaign = await ownedCampaign(env, p, id);
  await clientFor(env, p.workspaceId).unscheduleCampaign(p.workspaceId, id);
  await stopRun(env, id, campaign.runSeq);
  await audit(env, p, "campaign.unschedule", id);
}

export async function pauseCampaign(env: Env, p: Principal, id: string): Promise<void> {
  const campaign = await ownedCampaign(env, p, id);
  const outcome = await clientFor(env, p.workspaceId).pauseCampaign(p.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_sending") throw new RelayError("campaign not sending");
  await stopRun(env, id, campaign.runSeq);
  await audit(env, p, "campaign.pause", id);
}

export async function resumeCampaign(env: Env, p: Principal, id: string): Promise<{ runSeq: number }> {
  await ownedCampaign(env, p, id);
  const client = clientFor(env, p.workspaceId);
  const outcome = await client.resumeCampaign(p.workspaceId, id);
  try {
    await env.CAMPAIGNS.create({
      id: `${id}-${outcome.runSeq}`,
      params: { workspaceId: p.workspaceId, campaignId: id, runSeq: outcome.runSeq, at: 0 },
    });
  } catch (err) {
    console.error("campaign run create failed", id, describeError(err));
    await client.pauseCampaign(p.workspaceId, id);
    throw new RelayError("could not resume");
  }
  await audit(env, p, "campaign.resume", id);
  return { runSeq: outcome.runSeq };
}

export async function cancelCampaign(env: Env, p: Principal, id: string): Promise<{ dropped: number }> {
  const campaign = await ownedCampaign(env, p, id);
  const outcome = await clientFor(env, p.workspaceId).cancelCampaign(p.workspaceId, id);
  await stopRun(env, id, campaign.runSeq);
  await audit(env, p, "campaign.cancel", id, { dropped: outcome.dropped });
  return outcome;
}

// The test goes only to the signed-in user's own address; the request names no recipient.
export async function testSendCampaign(env: Env, p: Principal, id: string): Promise<SendResult> {
  if (!p.userId) throw new RelayError("forbidden");
  const [me] = await securityDb(env).select({ email: securityUser.email }).from(securityUser).where(eq(securityUser.id, p.userId));
  if (!me) throw new RelayError("forbidden");
  const profile = await getWorkspaceProfile(env, p.workspaceId);
  const result = await clientFor(env, p.workspaceId).testSendCampaign(p.workspaceId, id, me.email, profile.physicalAddress ?? null);
  await audit(env, p, "campaign.test", id);
  return result;
}
