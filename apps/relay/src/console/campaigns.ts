import { and, eq, sql } from "drizzle-orm";
import { hasDataToken } from "../shared/campaign-problems";
import { startCampaignRun, stopRun, verifiedSenders } from "../services/campaign-run";
import { refreshWorkspaceLimits } from "../services/limits";
import { clientFor } from "../do/client";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../shared/merge";
import { sanitizeEmailHtml } from "../core/sanitize-html";
import { ensureWorkspaceProfile, getWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { address, sendingDomain, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { user as securityUser } from "../db/security/schema";
import { decodeCursor } from "../core/cursor";
import type { CampaignPatch, CampaignSummary } from "../do/campaigns";
import type { SendResult } from "../do/types";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "./actor";
import { getApp } from "./apps";
import { RelayError, codeOf } from "../shared/errors";
import { type AudiencePreview, type CampaignStats, type CampaignView, type ListView } from "../shared/views";
import { DAY_MS } from "../shared/limits";

const READ = { campaign: ["read"] };
const WRITE = { campaign: ["write"] };
const SETTINGS = { settings: ["write"] };
const SEND = { campaign: ["send"] };

function requireRead(actor: ConsoleActor): void {
  if (!allows(actor.roles, READ)) throw new RelayError("forbidden");
}
function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, WRITE)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
}
function requireSend(actor: ConsoleActor): void {
  if (!allows(actor.roles, SEND)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
}

async function campaignOr404(env: Env, actor: ConsoleActor, id: string): Promise<CampaignView> {
  const campaign = await clientFor(env, actor.workspaceId).getCampaign(actor.workspaceId, id);
  if (!campaign) throw new RelayError("not found");
  return campaign;
}

export async function listCampaignsFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
  cursor?: string,
): Promise<{ rows: CampaignSummary[]; nextCursor: string | null }> {
  requireRead(actor);
  await getApp(env, actor, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  return clientFor(env, actor.workspaceId).listCampaigns(actor.workspaceId, cursor, appId);
}

export async function getCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<CampaignView> {
  requireRead(actor);
  return campaignOr404(env, actor, id);
}

export async function campaignStatsFor(env: Env, actor: ConsoleActor, id: string): Promise<CampaignStats> {
  requireRead(actor);
  const stats = await clientFor(env, actor.workspaceId).campaignStats(actor.workspaceId, id);
  if (!stats) throw new RelayError("not found");
  return stats;
}

export async function createCampaignFor(env: Env, actor: ConsoleActor, appId: string, name: string, templateId?: string): Promise<CampaignView> {
  requireWrite(actor);
  await getApp(env, actor, appId);
  const campaign = await clientFor(env, actor.workspaceId).createCampaign(actor.workspaceId, appId, name, templateId);
  if (campaign === "template_missing") throw new RelayError("not found");
  await writeAudit(env, {
    action: "campaign.create",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: campaign.id,
    data: { appId },
  });
  return campaign;
}

// Merge fields and the sender are checked here; the DO checks draft status and list ownership in its own transaction.
export async function updateCampaignFor(env: Env, actor: ConsoleActor, id: string, patch: CampaignPatch): Promise<CampaignView> {
  requireWrite(actor);
  const current = await campaignOr404(env, actor, id);
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
  if (patch.fromEmail && !(await verifiedSenders(env, actor.workspaceId, current.appId)).includes(patch.fromEmail)) {
    throw new RelayError("sender not verified");
  }
  const outcome = await clientFor(env, actor.workspaceId).updateCampaign(actor.workspaceId, id, patch);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  if (outcome === "bad_list") throw new RelayError("unknown list");
  await writeAudit(env, { action: "campaign.update", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return outcome;
}

export async function deleteCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).deleteCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  await writeAudit(env, { action: "campaign.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

// A hook audience is resolved at send time, so there is no count to preview.
export async function previewAudienceFor(env: Env, actor: ConsoleActor, id: string): Promise<AudiencePreview | null> {
  requireRead(actor);
  const campaign = await campaignOr404(env, actor, id);
  if (campaign.audienceKind === "hook") return null;
  return clientFor(env, actor.workspaceId).previewAudience(actor.workspaceId, campaign.appId, campaign.listIds, campaign.fromEmail);
}

export async function campaignOptionsFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
): Promise<{ senders: string[]; lists: ListView[]; postalAddress: string | null }> {
  requireRead(actor);
  await getApp(env, actor, appId);
  const [senders, lists, profile] = await Promise.all([
    verifiedSenders(env, actor.workspaceId, appId),
    clientFor(env, actor.workspaceId).listLists(actor.workspaceId, appId),
    getWorkspaceProfile(env, actor.workspaceId),
  ]);
  return { senders, lists, postalAddress: profile.physicalAddress ?? null };
}

// Settings write: the address reaches every campaign body, so the limits snapshot is refreshed at once.
export async function setPostalAddressFor(env: Env, actor: ConsoleActor, value: string): Promise<void> {
  if (!allows(actor.roles, SETTINGS)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
  await ensureWorkspaceProfile(env, actor.workspaceId);
  await coreDb(env)
    .update(workspaceProfile)
    .set({ physicalAddress: value, updatedAt: new Date() })
    .where(eq(workspaceProfile.workspaceId, actor.workspaceId));
  await refreshWorkspaceLimits(env, actor.workspaceId);
  await writeAudit(env, {
    action: "workspace.postal_address",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: actor.workspaceId,
  });
}

// Renders with the sample contact; unsubscribe links point at "#" and the HTML is sanitized as the recipient would see it.
export async function previewHtmlFor(
  env: Env,
  actor: ConsoleActor,
  id: string,
): Promise<{ htmlSafe: string; text: string; subject: string }> {
  requireRead(actor);
  const campaign = await campaignOr404(env, actor, id);
  return {
    htmlSafe: sanitizeEmailHtml(fillUnsubscribe(renderMerge(campaign.html, MERGE_SAMPLES, "html"), "#")).html,
    text: fillUnsubscribe(renderMerge(campaign.text, MERGE_SAMPLES, "text"), "#"),
    subject: renderMerge(campaign.subject, MERGE_SAMPLES, "subject"),
  };
}

export async function scheduleCampaignFor(env: Env, actor: ConsoleActor, id: string, at: number): Promise<{ runSeq: number }> {
  requireSend(actor);
  const now = Date.now();
  if (at < now - 60_000 || at > now + 365 * DAY_MS) throw new RelayError("invalid schedule");
  await campaignOr404(env, actor, id);
  const outcome = await startCampaignRun(env, actor.workspaceId, id, at);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  if (outcome === "could_not_schedule") throw new RelayError("could not schedule");
  if ("problems" in outcome) throw new RelayError("campaign not ready", 409, `campaign not ready: ${outcome.problems.join(", ")}`);
  await writeAudit(env, { action: "campaign.schedule", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return { runSeq: outcome.runSeq };
}

export async function unscheduleCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireSend(actor);
  const campaign = await campaignOr404(env, actor, id);
  const outcome = await clientFor(env, actor.workspaceId).unscheduleCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_scheduled") throw new RelayError("campaign not scheduled");
  await stopRun(env, id, campaign.runSeq);
  await writeAudit(env, { action: "campaign.unschedule", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

export async function pauseCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireSend(actor);
  const campaign = await campaignOr404(env, actor, id);
  const outcome = await clientFor(env, actor.workspaceId).pauseCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_sending") throw new RelayError("campaign not sending");
  await stopRun(env, id, campaign.runSeq);
  await writeAudit(env, { action: "campaign.pause", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

export async function resumeCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<{ runSeq: number }> {
  requireSend(actor);
  await campaignOr404(env, actor, id);
  const client = clientFor(env, actor.workspaceId);
  const outcome = await client.resumeCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_paused") throw new RelayError("campaign not paused");
  try {
    await env.CAMPAIGNS.create({
      id: `${id}-${outcome.runSeq}`,
      params: { workspaceId: actor.workspaceId, campaignId: id, runSeq: outcome.runSeq, at: 0 },
    });
  } catch {
    await client.pauseCampaign(actor.workspaceId, id);
    throw new RelayError("could not resume");
  }
  await writeAudit(env, { action: "campaign.resume", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return { runSeq: outcome.runSeq };
}

export async function cancelCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<{ dropped: number }> {
  requireSend(actor);
  const campaign = await campaignOr404(env, actor, id);
  const outcome = await clientFor(env, actor.workspaceId).cancelCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_cancellable") throw new RelayError("campaign not cancellable");
  await stopRun(env, id, campaign.runSeq);
  await writeAudit(env, {
    action: "campaign.cancel",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
    data: { dropped: outcome.dropped },
  });
  return outcome;
}

// The test goes only to the signed-in user's own address; the request names no recipient.
export async function testSendFor(env: Env, actor: ConsoleActor, id: string): Promise<SendResult> {
  requireWrite(actor);
  const [me] = await securityDb(env).select({ email: securityUser.email }).from(securityUser).where(eq(securityUser.id, actor.userId));
  if (!me) throw new RelayError("forbidden");
  const profile = await getWorkspaceProfile(env, actor.workspaceId);
  let result: SendResult | "missing";
  try {
    result = await clientFor(env, actor.workspaceId).testSendCampaign(actor.workspaceId, id, me.email, profile.physicalAddress ?? null);
  } catch (err) {
    const code = codeOf(err);
    if (code) throw new RelayError(code);
    throw err;
  }
  if (result === "missing") throw new RelayError("not found");
  await writeAudit(env, { action: "campaign.test", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return result;
}
