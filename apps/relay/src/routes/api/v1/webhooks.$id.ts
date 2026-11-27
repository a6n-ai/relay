import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../services/api-keys";
import { webhookPatchSchema } from "../../../core/webhooks";
import { deleteWebhookForScope, updateWebhookForScope } from "../../../services/webhooks";

export const Route = createFileRoute("/api/v1/webhooks/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        const body = webhookPatchSchema.safeParse(await request.json().catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        const view = await updateWebhookForScope(env, scope, params.id, body.data);
        if (!view) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(view);
      },
      DELETE: async ({ request, params }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        if (!(await deleteWebhookForScope(env, scope, params.id))) return Response.json({ error: "not found" }, { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
