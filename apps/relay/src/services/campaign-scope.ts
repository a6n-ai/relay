import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "../shared/scope";
import { hasDataToken } from "../shared/campaign-problems";
import { clientFor } from "../do/client";
import { unknownMergeFields } from "../shared/merge";
import { startCampaignRun, stopRun, verifiedSenders } from "./campaign-run";
import type { CampaignPatch, CampaignSummary } from "../do/campaigns";
import type { Env } from "../env";
import { z } from "zod";
import { RelayError } from "../shared/errors";
import { type CampaignStats, type CampaignView } from "../shared/views";
import { AUDIENCE_QUERY_MAX, DAY_MS, NAME_MAX } from "../shared/limits";
import { idSchema } from "../shared/schemas";


export const campaignCreateInput = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  templateId: idSchema.optional(),
  audienceKind: z.enum(["lists", "hook"]).optional(),
  audienceQuery: z.string().max(AUDIENCE_QUERY_MAX).nullable().optional(),
});

// Lets TiffinGrab send staff straight to the editor for a campaign it created or changed.
const withConsoleUrl = (env: Env, campaign: CampaignView) => ({
  ...campaign,
  consoleUrl: `${env.BETTER_AUTH_URL}/campaigns/${campaign.id}?appId=${campaign.appId}`,
});

const audit = (env: Env, scope: KeyScope, action: string, target: string) =>
  writeAudit(env, { action, actorUserId: null, workspaceId: scope.workspaceId, target, data: { keyId: scope.keyId } });

// A campaign of another app is a 404, the same as a missing one.
export async function ownedCampaign(env: Env, scope: KeyScope, id: string): Promise<CampaignView> {
  const campaign = await clientFor(env, scope.workspaceId).getCampaign(scope.workspaceId, id);
  if (!campaign || campaign.appId !== scope.appId) throw new RelayError("not found");
  return campaign;
}

export async function listCampaignsForScope(
  env: Env,
  scope: KeyScope,
  cursor?: string,
): Promise<{ rows: CampaignSummary[]; nextCursor: string | null }> {
  return clientFor(env, scope.workspaceId).listCampaigns(scope.workspaceId, cursor, scope.appId);
}

export async function getCampaignForScope(env: Env, scope: KeyScope, id: string): Promise<CampaignView> {
  return ownedCampaign(env, scope, id);
}

export async function createCampaignForScope(env: Env, scope: KeyScope, input: z.infer<typeof campaignCreateInput>) {
  const audience = input.audienceKind ? { audienceKind: input.audienceKind, audienceQuery: input.audienceQuery ?? null } : undefined;
  const campaign = await clientFor(env, scope.workspaceId).createCampaign(scope.workspaceId, scope.appId, input.name, input.templateId, audience);
  if (campaign === "template_missing") throw new RelayError("not found");
  await audit(env, scope, "campaign.create", campaign.id);
  return withConsoleUrl(env, campaign);
}

// Same checks as the console: merge fields, the hook data token, and a verified sender.
export async function updateCampaignForScope(env: Env, scope: KeyScope, id: string, patch: CampaignPatch) {
  const current = await ownedCampaign(env, scope, id);
  if (patch.audienceQuery && patch.audienceQuery.length > 1000) throw new RelayError("invalid input");
  const data = (patch.audienceKind ?? current.audienceKind) === "hook";
  for (const body of [patch.subject, patch.html, patch.text]) {
    if (body !== undefined && unknownMergeFields(body, { data }).length > 0) throw new RelayError("unknown merge field");
  }
  if (patch.audienceKind === "lists" && current.audienceKind === "hook" && [current.html, current.text].some(hasDataToken)) {
    throw new RelayError("campaign not ready", 409, "campaign not ready: data_fields_need_hook");
  }
  if (patch.fromEmail && !(await verifiedSenders(env, scope.workspaceId, scope.appId)).includes(patch.fromEmail)) {
    throw new RelayError("sender not verified");
  }
  const outcome = await clientFor(env, scope.workspaceId).updateCampaign(scope.workspaceId, id, patch);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  if (outcome === "bad_list") throw new RelayError("unknown list");
  await audit(env, scope, "campaign.update", id);
  return withConsoleUrl(env, outcome);
}

export async function deleteCampaignForScope(env: Env, scope: KeyScope, id: string): Promise<void> {
  await ownedCampaign(env, scope, id);
  const outcome = await clientFor(env, scope.workspaceId).deleteCampaign(scope.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  await audit(env, scope, "campaign.delete", id);
}

export async function scheduleCampaignForScope(env: Env, scope: KeyScope, id: string, at: number): Promise<{ runSeq: number }> {
  const now = Date.now();
  if (at < now - 60_000 || at > now + 365 * DAY_MS) throw new RelayError("invalid input");
  await ownedCampaign(env, scope, id);
  const outcome = await startCampaignRun(env, scope.workspaceId, id, at);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_draft") throw new RelayError("campaign not editable");
  if (outcome === "could_not_schedule") throw new RelayError("could not schedule");
  if ("problems" in outcome) throw new RelayError("campaign not ready", 409, `campaign not ready: ${outcome.problems.join(", ")}`);
  await audit(env, scope, "campaign.schedule", id);
  return { runSeq: outcome.runSeq };
}

export async function pauseCampaignForScope(env: Env, scope: KeyScope, id: string): Promise<void> {
  const campaign = await ownedCampaign(env, scope, id);
  const outcome = await clientFor(env, scope.workspaceId).pauseCampaign(scope.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_sending") throw new RelayError("campaign not sending");
  await stopRun(env, id, campaign.runSeq);
  await audit(env, scope, "campaign.pause", id);
}

export async function resumeCampaignForScope(env: Env, scope: KeyScope, id: string): Promise<{ runSeq: number }> {
  await ownedCampaign(env, scope, id);
  const client = clientFor(env, scope.workspaceId);
  const outcome = await client.resumeCampaign(scope.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_paused") throw new RelayError("campaign not paused");
  try {
    await env.CAMPAIGNS.create({
      id: `${id}-${outcome.runSeq}`,
      params: { workspaceId: scope.workspaceId, campaignId: id, runSeq: outcome.runSeq, at: 0 },
    });
  } catch {
    await client.pauseCampaign(scope.workspaceId, id);
    throw new RelayError("could not resume");
  }
  await audit(env, scope, "campaign.resume", id);
  return { runSeq: outcome.runSeq };
}

export async function cancelCampaignForScope(env: Env, scope: KeyScope, id: string): Promise<{ dropped: number }> {
  const campaign = await ownedCampaign(env, scope, id);
  const outcome = await clientFor(env, scope.workspaceId).cancelCampaign(scope.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_cancellable") throw new RelayError("campaign not cancellable");
  await stopRun(env, id, campaign.runSeq);
  await writeAudit(env, {
    action: "campaign.cancel",
    actorUserId: null,
    workspaceId: scope.workspaceId,
    target: id,
    data: { keyId: scope.keyId, dropped: outcome.dropped },
  });
  return outcome;
}

export async function campaignStatsForScope(env: Env, scope: KeyScope, id: string): Promise<CampaignStats> {
  await ownedCampaign(env, scope, id);
  const stats = await clientFor(env, scope.workspaceId).campaignStats(scope.workspaceId, id);
  if (!stats) throw new RelayError("not found");
  return stats;
}
