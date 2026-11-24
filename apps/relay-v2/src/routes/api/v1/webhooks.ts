import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../core/api-keys";
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
        const body = webhookInputSchema.safeParse(await request.json().catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        return Response.json(await createWebhookForScope(env, scope, body.data), { status: 201 });
      },
    },
  },
});
