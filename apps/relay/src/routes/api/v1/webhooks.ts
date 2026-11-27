import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json, readJson } from "../../../api/route";
import { webhookInputSchema } from "../../../services/schemas";
import { WEBHOOK_BODY_MAX } from "../../../shared/limits";
import { createWebhook, listWebhooks } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p }) => json({ data: await listWebhooks(env, p, p.appId) })),
      POST: apiRoute(async ({ env, p, request }) =>
        json(await createWebhook(env, p, p.appId, webhookInputSchema.parse(await readJson(request, WEBHOOK_BODY_MAX))), 201),
      ),
    },
  },
});
