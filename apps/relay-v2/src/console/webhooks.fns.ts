import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { webhookInputSchema, webhookPatchSchema } from "../core/webhooks";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import { appId, id, validate } from "./schemas";
import {
  createWebhookFor,
  deleteWebhookFor,
  listDeliveriesFor,
  listWebhooksFor,
  retryDeliveryFor,
  updateWebhookFor,
} from "./webhooks";

const READ = { permission: { webhook: ["read"] } };
const WRITE = { permission: { webhook: ["write"] }, write: true };

// Null means the role cannot see webhooks: the page shows a denied state instead of an error.
export const fetchWebhooks = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listWebhooksFor(env, actor, data.appId);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const fetchDeliveries = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId, webhookId: id, cursor: z.string().max(64).optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listDeliveriesFor(env, actor, data.appId, data.webhookId, data.cursor);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      toResponseError(err);
    }
  });

// The only place a webhook secret leaves the server: the create response, shown once by the dialog.
export const createWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookInputSchema.omit({ secret: true }).extend({ appId })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await createWebhookFor(env, actor, data.appId, { url: data.url, events: data.events, enabled: data.enabled });
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookPatchSchema.extend({ appId, id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      const { appId: scope, id: webhookId, ...patch } = data;
      return await updateWebhookFor(env, actor, scope, webhookId, patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await deleteWebhookFor(env, actor, data.appId, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const retryDeliveryFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await retryDeliveryFor(env, actor, data.appId, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
