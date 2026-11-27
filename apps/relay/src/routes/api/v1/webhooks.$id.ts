import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json, readJson } from "../../../api/route";
import { webhookPatchSchema } from "../../../core/webhooks";
import { deleteWebhook, updateWebhook } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks/$id")({
  server: {
    handlers: {
      PATCH: apiRoute(async ({ env, p, params, request }) =>
        json(await updateWebhook(env, p, p.appId, params.id, webhookPatchSchema.parse(await readJson(request, 65_536)))),
      ),
      DELETE: apiRoute(async ({ env, p, params }) => {
        await deleteWebhook(env, p, p.appId, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
