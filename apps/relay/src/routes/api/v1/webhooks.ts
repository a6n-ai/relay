import { createFileRoute } from "@tanstack/react-router";
import { readJson } from "../../../core/api-route";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../core/api-keys";
import { KEY_ERROR } from "../../../core/webhook-crypto";
import { createWebhookForScope, listWebhooksForScope, webhookInputSchema } from "../../../core/webhooks";

export const Route = createFileRoute("/api/v1/webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        return Response.json({ data: await listWebhooksForScope(env, scope) });
      },
      POST: async ({ request }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        const body = webhookInputSchema.safeParse(await readJson(request, 65_536).catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        try {
          return Response.json(await createWebhookForScope(env, scope, body.data), { status: 201 });
        } catch (err) {
          if (err instanceof Error && err.message === KEY_ERROR) {
            return Response.json({ error: "webhooks unavailable" }, { status: 503 });
          }
          throw err;
        }
      },
    },
  },
});
