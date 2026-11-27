import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json, readJson } from "../../../api/route";
import { webhookPatchSchema } from "../../../core/webhooks";
import { deleteWebhook, updateWebhook } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks/$id")({
  server: {
    handlers: {
      PATCH: apiRoute(async ({ env, scope, p, params, request }) =>
        json(await updateWebhook(env, p, scope.appId, params.id, webhookPatchSchema.parse(await readJson(request, 65_536)))),
      ),
      DELETE: apiRoute(async ({ env, scope, p, params }) => {
        await deleteWebhook(env, p, scope.appId, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
