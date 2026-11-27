import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { webhookInputSchema, webhookPatchSchema } from "../core/webhooks";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { appId, id, validate } from "./schemas";
import { fromActor } from "../services/principal";
import { createWebhook, deleteWebhook, listDeliveries, listWebhooks, retryDelivery, updateWebhook } from "../services/webhooks";

const VIEW = READ("webhook", "read");
const EDIT = WRITE("webhook", "write");

// Null means the role cannot see webhooks: the page shows a denied state instead of an error.
export const fetchWebhooks = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => read(VIEW, (actor) => listWebhooks(env, fromActor(actor), data.appId)));

export const fetchDeliveries = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId, webhookId: id, cursor: z.string().max(64).optional() })))
  .handler(({ data }) => read(VIEW, (actor) => listDeliveries(env, actor, data.appId, data.webhookId, data.cursor)));

// The only place a webhook secret leaves the server: the create response, shown once by the dialog.
export const createWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookInputSchema.omit({ secret: true }).extend({ appId })))
  .handler(({ data }) =>
    run(EDIT, (actor) =>
      createWebhook(env, fromActor(actor), data.appId, { url: data.url, events: data.events, enabled: data.enabled }),
    ),
  );

export const updateWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookPatchSchema.extend({ appId, id })))
  .handler(({ data }) => {
    const { appId: scope, id: webhookId, ...patch } = data;
    return run(EDIT, (actor) => updateWebhook(env, fromActor(actor), scope, webhookId, patch));
  });

export const deleteWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(({ data }) => run(EDIT, (actor) => deleteWebhook(env, fromActor(actor), data.appId, data.id)));

export const retryDeliveryFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(({ data }) => run(EDIT, (actor) => retryDelivery(env, fromActor(actor), data.appId, data.id)));
