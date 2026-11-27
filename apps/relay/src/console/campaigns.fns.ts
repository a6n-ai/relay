import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { postalAddress, validate } from "./schemas";
import { campaignPatch, id, name } from "../services/schemas";
import {
  campaignOptions,
  campaignStats,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  pauseCampaign,
  previewAudience,
  previewHtml,
  resumeCampaign,
  scheduleCampaign,
  setPostalAddress,
  testSendCampaign,
  unscheduleCampaign,
  updateCampaign,
} from "../services/campaigns";

const VIEW = READ("campaign", "read");
const EDIT = WRITE("campaign", "write");
const SETTINGS = WRITE("settings", "write");
const SEND = WRITE("campaign", "send");

// Null means the role cannot see campaigns: the page shows a denied state instead of an error.
export const fetchCampaigns = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id, cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, (p) => listCampaigns(env, p, data.appId, data.cursor)));

export const fetchCampaignStats = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => campaignStats(env, p, data.id)));

export const fetchCampaign = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => getCampaign(env, p, data.id)));

export const fetchCampaignOptions = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(({ data }) => read(VIEW, (p) => campaignOptions(env, p, data.appId)));

export const previewAudienceFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => previewAudience(env, p, data.id)));

export const previewHtmlFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => previewHtml(env, p, data.id)));

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, name, templateId: id.optional() })))
  .handler(({ data }) =>
    run(EDIT, (p) => createCampaign(env, p, data.appId, { name: data.name, templateId: data.templateId })),
  );

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: campaignPatch })))
  .handler(({ data }) => run(EDIT, (p) => updateCampaign(env, p, data.id, data.patch)));

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => deleteCampaign(env, p, data.id)));

export const scheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, at: z.number().int().positive() })))
  .handler(({ data }) => run(SEND, (p) => scheduleCampaign(env, p, data.id, data.at)));

export const unscheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (p) => unscheduleCampaign(env, p, data.id)));

export const pauseCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (p) => pauseCampaign(env, p, data.id)));

export const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (p) => resumeCampaign(env, p, data.id)));

export const cancelCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (p) => cancelCampaign(env, p, data.id)));

export const testSendCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => testSendCampaign(env, p, data.id)));

export const setPostalAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ address: postalAddress })))
  .handler(({ data }) => run(SETTINGS, (p) => setPostalAddress(env, p, data.address)));
