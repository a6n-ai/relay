import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { resolveApiKey, withinRateLimit } from "../services/api-keys";
import type { KeyPrincipal } from "../services/principal";
import { logFailure } from "../core/log";
import { deleteAudienceHook, getAudienceHook, setAudienceHook } from "../services/audience-hook";
import {
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
import { messagesByKeys, suppress, suppressionStatus } from "../services/lookups";
import {
  addMember,
  createList,
  deleteList,
  importMembers,
  listLists,
  listMembers,
  removeMember,
  updateList,
} from "../services/lists";
import {
  getMessage,
  isSuppressed,
  sendMessage,
  sendTemplateMessage,
} from "../services/messages";
import { memberInput, sendBody, templateSendSchema } from "../shared/schemas";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  templateOverrides,
  updateTemplate,
} from "../services/templates";
import { campaignCreateInput, campaignPatch, listInput, listPatch, membersImportInput, templateInput, templatePatch } from "../services/schemas";
import type { Env } from "../env";
import { RelayError, statusOf } from "../shared/errors";
import { STREAMS } from "../shared/mail";

// Module-level, not a method: WorkerEntrypoint exposes every method over RPC, private or not.
async function principalOf(env: Env, apiKey: string): Promise<KeyPrincipal> {
  const p = await resolveApiKey(env, apiKey);
  if (!p) throw new RelayError("unauthorized");
  if (!(await withinRateLimit(env, p.keyId))) throw new Error("rate limited");
  return p;
}

// Every scoped method runs through here: a RelayError reaches the caller as a plain Error with the same message.
async function withPrincipal<T>(env: Env, apiKey: string, call: (p: KeyPrincipal) => Promise<T>): Promise<T> {
  const p = await principalOf(env, apiKey);
  try {
    return await call(p);
  } catch (err) {
    logFailure(`rpc key=${p.keyId}`, statusOf(err) ?? 500, err);
    if (err instanceof RelayError) throw new Error(err.message);
    throw err;
  }
}

const streamName = z.enum(STREAMS);

export class RelayRpc extends WorkerEntrypoint<Env> {
  async send(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => sendMessage(this.env, p, sendBody.parse(input)));
  }

  async sendTemplate(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => sendTemplateMessage(this.env, p, templateSendSchema.parse(input)));
  }

  async getMessage(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => getMessage(this.env, p, id));
  }

  async listLists(apiKey: string) {
    return withPrincipal(this.env, apiKey, (p) => listLists(this.env, p, p.appId));
  }

  async createList(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => createList(this.env, p, p.appId, listInput.parse(input)));
  }

  async updateList(apiKey: string, id: string, patch: unknown) {
    return withPrincipal(this.env, apiKey, (p) => updateList(this.env, p, id, listPatch.parse(patch)));
  }

  async deleteList(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => deleteList(this.env, p, id));
  }

  async listMembers(apiKey: string, listId: string, cursor?: string) {
    return withPrincipal(this.env, apiKey, (p) => listMembers(this.env, p, listId, cursor));
  }

  async addMember(apiKey: string, listId: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => addMember(this.env, p, listId, memberInput.parse(input)));
  }

  async removeMember(apiKey: string, listId: string, memberId: string) {
    return withPrincipal(this.env, apiKey, (p) => removeMember(this.env, p, listId, memberId));
  }

  async importMembers(apiKey: string, listId: string, rows: unknown) {
    return withPrincipal(this.env, apiKey, (p) => importMembers(this.env, p, listId, membersImportInput.parse({ rows }).rows));
  }

  async listCampaigns(apiKey: string, cursor?: string) {
    return withPrincipal(this.env, apiKey, (p) => listCampaigns(this.env, p, p.appId, cursor));
  }

  async getCampaign(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => getCampaign(this.env, p, id));
  }

  async createCampaign(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => createCampaign(this.env, p, p.appId, campaignCreateInput.parse(input)).then((c) => withConsoleUrl(this.env, c)));
  }

  async updateCampaign(apiKey: string, id: string, patch: unknown) {
    return withPrincipal(this.env, apiKey, (p) => updateCampaign(this.env, p, id, campaignPatch.parse(patch)).then((c) => withConsoleUrl(this.env, c)));
  }

  async deleteCampaign(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => deleteCampaign(this.env, p, id));
  }

  async scheduleCampaign(apiKey: string, id: string, at: number) {
    return withPrincipal(this.env, apiKey, (p) => scheduleCampaign(this.env, p, id, z.number().int().parse(at)));
  }

  async pauseCampaign(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => pauseCampaign(this.env, p, id));
  }

  async resumeCampaign(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => resumeCampaign(this.env, p, id));
  }

  async cancelCampaign(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => cancelCampaign(this.env, p, id));
  }

  async campaignStats(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => campaignStats(this.env, p, id));
  }

  async listTemplates(apiKey: string, cursor?: string) {
    return withPrincipal(this.env, apiKey, (p) => listTemplates(this.env, p, p.appId, cursor));
  }

  async getTemplate(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => getTemplate(this.env, p, id));
  }

  async createTemplate(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => createTemplate(this.env, p, p.appId, templateInput.parse(input)));
  }

  async updateTemplate(apiKey: string, id: string, patch: unknown) {
    return withPrincipal(this.env, apiKey, (p) => updateTemplate(this.env, p, id, templatePatch.parse(patch)));
  }

  async deleteTemplate(apiKey: string, id: string) {
    return withPrincipal(this.env, apiKey, (p) => deleteTemplate(this.env, p, id));
  }

  async templateOverrides(apiKey: string) {
    return withPrincipal(this.env, apiKey, (p) => templateOverrides(this.env, p));
  }

  async setAudienceHook(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => setAudienceHook(this.env, p, p.appId, input));
  }

  async getAudienceHook(apiKey: string) {
    return withPrincipal(this.env, apiKey, (p) => getAudienceHook(this.env, p, p.appId));
  }

  async deleteAudienceHook(apiKey: string) {
    return withPrincipal(this.env, apiKey, (p) => deleteAudienceHook(this.env, p, p.appId));
  }

  async isSuppressed(apiKey: string, email: string, stream: string, from?: string) {
    return withPrincipal(this.env, apiKey, (p) => isSuppressed(this.env, p, email, streamName.parse(stream), from));
  }

  async messagesByKeys(apiKey: string, keys: unknown) {
    return withPrincipal(this.env, apiKey, (p) => messagesByKeys(this.env, p, keys));
  }

  async suppressionStatus(apiKey: string, emails: unknown, from?: unknown) {
    return withPrincipal(this.env, apiKey, (p) => suppressionStatus(this.env, p, emails, from));
  }

  async suppress(apiKey: string, input: unknown) {
    return withPrincipal(this.env, apiKey, (p) => suppress(this.env, p, input));
  }
}
