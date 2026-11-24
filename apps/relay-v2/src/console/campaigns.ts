import { and, eq, sql } from "drizzle-orm";
import { refreshWorkspaceLimits } from "../core/limits";
import { clientFor } from "../core/messages";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../core/merge";
import { sanitizeEmailHtml } from "../core/sanitize-html";
import { ensureWorkspaceProfile, getWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { address, sendingDomain, workspaceProfile } from "../db/core/schema";
import { decodeCursor } from "../do/console-reads";
import type { AudiencePreview, CampaignPatch, CampaignSummary, CampaignView } from "../do/campaigns";
import type { ListView } from "../do/lists";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor } from "./actor";
import { getApp } from "./apps";

const READ = { campaign: ["read"] };
const WRITE = { campaign: ["write"] };
const SETTINGS = { settings: ["write"] };

function requireRead(actor: ConsoleActor): void {
  if (!allows(actor.roles, READ)) throw new ConsoleError(403, "forbidden");
}
function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, WRITE)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
}

// Same join as the send path's sender snapshot: the address's domain must be verified in this workspace.
async function verifiedSenders(env: Env, workspaceId: string, appId: string): Promise<string[]> {
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

async function campaignOr404(env: Env, actor: ConsoleActor, id: string): Promise<CampaignView> {
  const campaign = await clientFor(env, actor.workspaceId).getCampaign(actor.workspaceId, id);
  if (!campaign) throw new ConsoleError(404, "not found");
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
  if (cursor !== undefined && !decodeCursor(cursor)) throw new ConsoleError(400, "invalid cursor");
  return clientFor(env, actor.workspaceId).listCampaigns(actor.workspaceId, cursor, appId);
}

export async function getCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<CampaignView> {
  requireRead(actor);
  return campaignOr404(env, actor, id);
}

export async function createCampaignFor(env: Env, actor: ConsoleActor, appId: string, name: string): Promise<CampaignView> {
  requireWrite(actor);
  await getApp(env, actor, appId);
  const campaign = await clientFor(env, actor.workspaceId).createCampaign(actor.workspaceId, appId, name);
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
  for (const body of [patch.subject, patch.html, patch.text]) {
    if (body !== undefined && unknownMergeFields(body).length > 0) throw new ConsoleError(400, "unknown merge field");
  }
  if (patch.fromEmail && !(await verifiedSenders(env, actor.workspaceId, current.appId)).includes(patch.fromEmail)) {
    throw new ConsoleError(400, "sender not verified");
  }
  const outcome = await clientFor(env, actor.workspaceId).updateCampaign(actor.workspaceId, id, patch);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if (outcome === "not_draft") throw new ConsoleError(409, "campaign not editable");
  if (outcome === "bad_list") throw new ConsoleError(400, "unknown list");
  await writeAudit(env, { action: "campaign.update", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return outcome;
}

export async function deleteCampaignFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).deleteCampaign(actor.workspaceId, id);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if (outcome === "not_draft") throw new ConsoleError(409, "campaign not editable");
  await writeAudit(env, { action: "campaign.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

export async function previewAudienceFor(env: Env, actor: ConsoleActor, id: string): Promise<AudiencePreview> {
  requireRead(actor);
  const campaign = await campaignOr404(env, actor, id);
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
  if (!allows(actor.roles, SETTINGS)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
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
