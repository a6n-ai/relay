import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { resolveApiKey, withinRateLimit, type KeyScope } from "../core/api-keys";
import { ApiError } from "../core/api-error";
import { logFailure } from "../core/log";
import { deleteAudienceHookForScope, getAudienceHookForScope, setAudienceHookForScope } from "../core/audience-hook";
import {
  campaignCreateInput,
  cancelCampaignForScope,
  campaignStatsForScope,
  createCampaignForScope,
  deleteCampaignForScope,
  getCampaignForScope,
  listCampaignsForScope,
  pauseCampaignForScope,
  resumeCampaignForScope,
  scheduleCampaignForScope,
  updateCampaignForScope,
} from "../core/campaign-scope";
import { memberInput } from "../core/member-input";
import { messagesByKeysForScope, suppressForScope, suppressionStatusForScope } from "../core/lookups";
import {
  addMemberForScope,
  createListForScope,
  membersImportInput,
  deleteListForScope,
  importMembersForScope,
  listListsForScope,
  listMembersForScope,
  removeMemberForScope,
  updateListForScope,
} from "../core/lists";
import {
  getMessageForScope,
  isSuppressedForScope,
  sendMessage,
  sendTemplateMessage,
} from "../core/messages";
import { sendBody, templateSendSchema } from "../core/send-input";
import {
  createTemplateForScope,
  deleteTemplateForScope,
  getTemplateForScope,
  listTemplatesForScope,
  templateOverridesForScope,
  updateTemplateForScope,
} from "../core/templates";
import { campaignPatch, listInput, listPatch, templateInput, templatePatch } from "../console/schemas";
import type { Env } from "../env";

// Module-level, not a method: WorkerEntrypoint exposes every method over RPC, private or not.
async function scopeOf(env: Env, apiKey: string): Promise<KeyScope> {
  const scope = await resolveApiKey(env, apiKey);
  if (!scope) throw new Error("unauthorized");
  if (!(await withinRateLimit(env, scope.keyId))) throw new Error("rate limited");
  return scope;
}

// Every scoped method runs through here: an ApiError reaches the caller as a plain Error with the same message.
async function withScope<T>(env: Env, apiKey: string, call: (scope: KeyScope) => Promise<T>): Promise<T> {
  const scope = await scopeOf(env, apiKey);
  try {
    return await call(scope);
  } catch (err) {
    logFailure(`rpc key=${scope.keyId}`, err instanceof ApiError ? err.status : 500, err);
    if (err instanceof ApiError) throw new Error(err.message);
    throw err;
  }
}

const streamName = z.enum(["transactional", "tracked", "marketing"]);

export class RelayRpc extends WorkerEntrypoint<Env> {
  async send(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (scope) => sendMessage(this.env, scope, sendBody.parse(input)));
  }

  async sendTemplate(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (scope) => sendTemplateMessage(this.env, scope, templateSendSchema.parse(input)));
  }

  async getMessage(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (scope) => getMessageForScope(this.env, scope, id));
  }

  async listLists(apiKey: string) {
    return withScope(this.env, apiKey, (s) => listListsForScope(this.env, s));
  }

  async createList(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createListForScope(this.env, s, listInput.parse(input)));
  }

  async updateList(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateListForScope(this.env, s, id, listPatch.parse(patch)));
  }

  async deleteList(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteListForScope(this.env, s, id));
  }

  async listMembers(apiKey: string, listId: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listMembersForScope(this.env, s, listId, cursor));
  }

  async addMember(apiKey: string, listId: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => addMemberForScope(this.env, s, listId, memberInput.parse(input)));
  }

  async removeMember(apiKey: string, listId: string, memberId: string) {
    return withScope(this.env, apiKey, (s) => removeMemberForScope(this.env, s, listId, memberId));
  }

  async importMembers(apiKey: string, listId: string, rows: unknown) {
    return withScope(this.env, apiKey, (s) => importMembersForScope(this.env, s, listId, membersImportInput.parse({ rows }).rows));
  }

  async listCampaigns(apiKey: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listCampaignsForScope(this.env, s, cursor));
  }

  async getCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => getCampaignForScope(this.env, s, id));
  }

  async createCampaign(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createCampaignForScope(this.env, s, campaignCreateInput.parse(input)));
  }

  async updateCampaign(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateCampaignForScope(this.env, s, id, campaignPatch.parse(patch)));
  }

  async deleteCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteCampaignForScope(this.env, s, id));
  }

  async scheduleCampaign(apiKey: string, id: string, at: number) {
    return withScope(this.env, apiKey, (s) => scheduleCampaignForScope(this.env, s, id, z.number().int().parse(at)));
  }

  async pauseCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => pauseCampaignForScope(this.env, s, id));
  }

  async resumeCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => resumeCampaignForScope(this.env, s, id));
  }

  async cancelCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => cancelCampaignForScope(this.env, s, id));
  }

  async campaignStats(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => campaignStatsForScope(this.env, s, id));
  }

  async listTemplates(apiKey: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listTemplatesForScope(this.env, s, cursor));
  }

  async getTemplate(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => getTemplateForScope(this.env, s, id));
  }

  async createTemplate(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createTemplateForScope(this.env, s, templateInput.parse(input)));
  }

  async updateTemplate(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateTemplateForScope(this.env, s, id, templatePatch.parse(patch)));
  }

  async deleteTemplate(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteTemplateForScope(this.env, s, id));
  }

  async templateOverrides(apiKey: string) {
    return withScope(this.env, apiKey, (s) => templateOverridesForScope(this.env, s));
  }

  async setAudienceHook(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => setAudienceHookForScope(this.env, s, input));
  }

  async getAudienceHook(apiKey: string) {
    return withScope(this.env, apiKey, (s) => getAudienceHookForScope(this.env, s));
  }

  async deleteAudienceHook(apiKey: string) {
    return withScope(this.env, apiKey, (s) => deleteAudienceHookForScope(this.env, s));
  }

  async isSuppressed(apiKey: string, email: string, stream: string, from?: string) {
    return withScope(this.env, apiKey, (s) => isSuppressedForScope(this.env, s, email, streamName.parse(stream), from));
  }

  async messagesByKeys(apiKey: string, keys: unknown) {
    return withScope(this.env, apiKey, (s) => messagesByKeysForScope(this.env, s, keys));
  }

  async suppressionStatus(apiKey: string, emails: unknown, from?: unknown) {
    return withScope(this.env, apiKey, (s) => suppressionStatusForScope(this.env, s, emails, from));
  }

  async suppress(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => suppressForScope(this.env, s, input));
  }
}
