import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, run, WRITE } from "./guard";
import { id, name, postalAddress, validate } from "./schemas";
import { campaignPatch } from "../services/schemas";
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
import { fromActor } from "../services/principal";

const VIEW = READ("campaign", "read");
const EDIT = WRITE("campaign", "write");
const SETTINGS = WRITE("settings", "write");
const SEND = WRITE("campaign", "send");

// Null means the role cannot see campaigns: the page shows a denied state instead of an error.
export const fetchCampaigns = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id, cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, (actor) => listCampaigns(env, fromActor(actor), data.appId, data.cursor)));

export const fetchCampaignStats = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (actor) => campaignStats(env, fromActor(actor), data.id)));

export const fetchCampaign = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (actor) => getCampaign(env, fromActor(actor), data.id)));

export const fetchCampaignOptions = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(({ data }) => read(VIEW, (actor) => campaignOptions(env, fromActor(actor), data.appId)));

export const previewAudienceFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (actor) => previewAudience(env, fromActor(actor), data.id)));

export const previewHtmlFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (actor) => previewHtml(env, fromActor(actor), data.id)));

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, name, templateId: id.optional() })))
  .handler(({ data }) =>
    run(EDIT, (actor) => createCampaign(env, fromActor(actor), data.appId, { name: data.name, templateId: data.templateId })),
  );

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: campaignPatch })))
  .handler(({ data }) => run(EDIT, (actor) => updateCampaign(env, fromActor(actor), data.id, data.patch)));

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => deleteCampaign(env, fromActor(actor), data.id)));

export const scheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, at: z.number().int().positive() })))
  .handler(({ data }) => run(SEND, (actor) => scheduleCampaign(env, fromActor(actor), data.id, data.at)));

export const unscheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (actor) => unscheduleCampaign(env, fromActor(actor), data.id)));

export const pauseCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (actor) => pauseCampaign(env, fromActor(actor), data.id)));

export const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (actor) => resumeCampaign(env, fromActor(actor), data.id)));

export const cancelCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (actor) => cancelCampaign(env, fromActor(actor), data.id)));

export const testSendCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => testSendCampaign(env, fromActor(actor), data.id)));

export const setPostalAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ address: postalAddress })))
  .handler(({ data }) => run(SETTINGS, (actor) => setPostalAddress(env, fromActor(actor), data.address)));
