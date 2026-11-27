import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json, readJson } from "../../../api/route";
import { webhookInputSchema } from "../../../services/schemas";
import { createWebhook, listWebhooks } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p }) => json({ data: await listWebhooks(env, p, p.appId) })),
      POST: apiRoute(async ({ env, p, request }) =>
        json(await createWebhook(env, p, p.appId, webhookInputSchema.parse(await readJson(request, 65_536))), 201),
      ),
    },
  },
});
