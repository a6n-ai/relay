import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { resolveApiKey, withinRateLimit } from "../services/api-keys";
import { fromScope } from "../services/principal";
import { type KeyScope } from "../shared/scope";
import { logFailure } from "../core/log";
import { deleteAudienceHook, getAudienceHook, setAudienceHook } from "../services/audience-hook";
import {
  campaignCreateInput,
  campaignStats,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
  updateCampaign,
  withConsoleUrl,
} from "../services/campaigns";
import { memberInput } from "../core/member-input";
import { messagesByKeysForScope, suppressForScope, suppressionStatusForScope } from "../services/lookups";
import {
  addMember,
  createList,
  deleteList,
  importMembers,
  listLists,
  listMembers,
  membersImportInput,
  removeMember,
  updateList,
} from "../services/lists";
import {
  getMessageForScope,
  isSuppressedForScope,
  sendMessage,
  sendTemplateMessage,
} from "../services/messages";
import { sendBody, templateSendSchema } from "../core/send-input";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  templateOverrides,
  updateTemplate,
} from "../services/templates";
import { campaignPatch, listInput, listPatch, templateInput, templatePatch } from "../services/schemas";
import type { Env } from "../env";
import { codeOf, ERRORS, RelayError } from "../shared/errors";
import { STREAMS } from "../shared/mail";

// Module-level, not a method: WorkerEntrypoint exposes every method over RPC, private or not.
async function scopeOf(env: Env, apiKey: string): Promise<KeyScope> {
  const scope = await resolveApiKey(env, apiKey);
  if (!scope) throw new RelayError("unauthorized");
  if (!(await withinRateLimit(env, scope.keyId))) throw new Error("rate limited");
  return scope;
}

// Every scoped method runs through here: a RelayError reaches the caller as a plain Error with the same message.
async function withScope<T>(env: Env, apiKey: string, call: (scope: KeyScope) => Promise<T>): Promise<T> {
  const scope = await scopeOf(env, apiKey);
  try {
    return await call(scope);
  } catch (err) {
    // A refusal from ClientDO crosses RPC as a plain Error whose message is its code.
    const code = codeOf(err);
    logFailure(`rpc key=${scope.keyId}`, err instanceof RelayError ? err.status : code ? ERRORS[code].status : 500, err);
    if (err instanceof RelayError) throw new Error(err.message);
    throw err;
  }
}

const streamName = z.enum(STREAMS);

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
    return withScope(this.env, apiKey, (s) => listLists(this.env, fromScope(s), s.appId));
  }

  async createList(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createList(this.env, fromScope(s), s.appId, listInput.parse(input)));
  }

  async updateList(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateList(this.env, fromScope(s), id, listPatch.parse(patch)));
  }

  async deleteList(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteList(this.env, fromScope(s), id));
  }

  async listMembers(apiKey: string, listId: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listMembers(this.env, fromScope(s), listId, cursor));
  }

  async addMember(apiKey: string, listId: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => addMember(this.env, fromScope(s), listId, memberInput.parse(input)));
  }

  async removeMember(apiKey: string, listId: string, memberId: string) {
    return withScope(this.env, apiKey, (s) => removeMember(this.env, fromScope(s), listId, memberId));
  }

  async importMembers(apiKey: string, listId: string, rows: unknown) {
    return withScope(this.env, apiKey, (s) => importMembers(this.env, fromScope(s), listId, membersImportInput.parse({ rows }).rows));
  }

  async listCampaigns(apiKey: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listCampaigns(this.env, fromScope(s), s.appId, cursor));
  }

  async getCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => getCampaign(this.env, fromScope(s), id));
  }

  async createCampaign(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createCampaign(this.env, fromScope(s), s.appId, campaignCreateInput.parse(input)).then((c) => withConsoleUrl(this.env, c)));
  }

  async updateCampaign(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateCampaign(this.env, fromScope(s), id, campaignPatch.parse(patch)).then((c) => withConsoleUrl(this.env, c)));
  }

  async deleteCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteCampaign(this.env, fromScope(s), id));
  }

  async scheduleCampaign(apiKey: string, id: string, at: number) {
    return withScope(this.env, apiKey, (s) => scheduleCampaign(this.env, fromScope(s), id, z.number().int().parse(at)));
  }

  async pauseCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => pauseCampaign(this.env, fromScope(s), id));
  }

  async resumeCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => resumeCampaign(this.env, fromScope(s), id));
  }

  async cancelCampaign(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => cancelCampaign(this.env, fromScope(s), id));
  }

  async campaignStats(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => campaignStats(this.env, fromScope(s), id));
  }

  async listTemplates(apiKey: string, cursor?: string) {
    return withScope(this.env, apiKey, (s) => listTemplates(this.env, fromScope(s), s.appId, cursor));
  }

  async getTemplate(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => getTemplate(this.env, fromScope(s), id));
  }

  async createTemplate(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => createTemplate(this.env, fromScope(s), s.appId, templateInput.parse(input)));
  }

  async updateTemplate(apiKey: string, id: string, patch: unknown) {
    return withScope(this.env, apiKey, (s) => updateTemplate(this.env, fromScope(s), id, templatePatch.parse(patch)));
  }

  async deleteTemplate(apiKey: string, id: string) {
    return withScope(this.env, apiKey, (s) => deleteTemplate(this.env, fromScope(s), id));
  }

  async templateOverrides(apiKey: string) {
    return withScope(this.env, apiKey, (s) => templateOverrides(this.env, fromScope(s)));
  }

  async setAudienceHook(apiKey: string, input: unknown) {
    return withScope(this.env, apiKey, (s) => setAudienceHook(this.env, fromScope(s), s.appId, input));
  }

  async getAudienceHook(apiKey: string) {
    return withScope(this.env, apiKey, (s) => getAudienceHook(this.env, fromScope(s), s.appId));
  }

  async deleteAudienceHook(apiKey: string) {
    return withScope(this.env, apiKey, (s) => deleteAudienceHook(this.env, fromScope(s), s.appId));
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
