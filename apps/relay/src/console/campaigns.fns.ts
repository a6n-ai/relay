import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import {
  campaignOptionsFor,
  campaignStatsFor,
  cancelCampaignFor,
  createCampaignFor,
  deleteCampaignFor,
  getCampaignFor,
  listCampaignsFor,
  pauseCampaignFor,
  previewAudienceFor,
  previewHtmlFor,
  resumeCampaignFor,
  scheduleCampaignFor,
  setPostalAddressFor,
  testSendFor,
  unscheduleCampaignFor,
  updateCampaignFor,
} from "./campaigns";
import { id, name, postalAddress, validate } from "./schemas";
import { campaignPatch } from "../services/schemas";
import { RelayError } from "../shared/errors";

const READ = { permission: { campaign: ["read"] } };
const WRITE = { permission: { campaign: ["write"] }, write: true };
const SETTINGS = { permission: { settings: ["write"] }, write: true };
const SEND = { permission: { campaign: ["send"] }, write: true };

// Null means the role cannot see campaigns: the page shows a denied state instead of an error.
export const fetchCampaigns = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id, cursor: z.string().max(254).optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listCampaignsFor(env, actor, data.appId, data.cursor);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const fetchCampaignStats = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await campaignStatsFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const fetchCampaign = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await getCampaignFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const fetchCampaignOptions = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await campaignOptionsFor(env, actor, data.appId);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const previewAudienceFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await previewAudienceFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const previewHtmlFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await previewHtmlFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, name, templateId: id.optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await createCampaignFor(env, actor, data.appId, data.name, data.templateId);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: campaignPatch })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await updateCampaignFor(env, actor, data.id, data.patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await deleteCampaignFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const scheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, at: z.number().int().positive() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await scheduleCampaignFor(env, actor, data.id, data.at);
    } catch (err) {
      toResponseError(err);
    }
  });

export const unscheduleCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      await unscheduleCampaignFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const pauseCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      await pauseCampaignFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await resumeCampaignFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const cancelCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await cancelCampaignFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const testSendCampaignFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await testSendFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setPostalAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ address: postalAddress })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SETTINGS);
      await setPostalAddressFor(env, actor, data.address);
    } catch (err) {
      toResponseError(err);
    }
  });
