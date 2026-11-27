import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json, readJson } from "../../../api/route";
import { webhookInputSchema } from "../../../core/webhooks";
import { createWebhook, listWebhooks } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, p }) => json({ data: await listWebhooks(env, p, scope.appId) })),
      POST: apiRoute(async ({ env, scope, p, request }) =>
        json(await createWebhook(env, p, scope.appId, webhookInputSchema.parse(await readJson(request, 65_536))), 201),
      ),
    },
  },
});
