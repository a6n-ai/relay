import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { webhookInputSchema, webhookPatchSchema } from "../core/webhooks";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { appId, id, validate } from "./schemas";
import { createWebhook, deleteWebhook, listDeliveries, listWebhooks, retryDelivery, updateWebhook } from "../services/webhooks";

const VIEW = READ("webhook", "read");
const EDIT = WRITE("webhook", "write");

// Null means the role cannot see webhooks: the page shows a denied state instead of an error.
export const fetchWebhooks = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => read(VIEW, (p) => listWebhooks(env, p, data.appId)));

export const fetchDeliveries = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId, webhookId: id, cursor: z.string().max(64).optional() })))
  .handler(({ data }) => read(VIEW, (p) => listDeliveries(env, p, data.appId, data.webhookId, data.cursor)));

// The only place a webhook secret leaves the server: the create response, shown once by the dialog.
export const createWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookInputSchema.omit({ secret: true }).extend({ appId })))
  .handler(({ data }) =>
    run(EDIT, (p) =>
      createWebhook(env, p, data.appId, { url: data.url, events: data.events, enabled: data.enabled }),
    ),
  );

export const updateWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(webhookPatchSchema.extend({ appId, id })))
  .handler(({ data }) => {
    const { appId: scope, id: webhookId, ...patch } = data;
    return run(EDIT, (p) => updateWebhook(env, p, scope, webhookId, patch));
  });

export const deleteWebhookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(({ data }) => run(EDIT, (p) => deleteWebhook(env, p, data.appId, data.id)));

export const retryDeliveryFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, id })))
  .handler(({ data }) => run(EDIT, (p) => retryDelivery(env, p, data.appId, data.id)));
