import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../core/api-keys";
import { getMessageForScope } from "../../../core/messages";

export const Route = createFileRoute("/api/v1/messages/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        const view = await getMessageForScope(env, scope, params.id);
        if (!view) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(view);
      },
    },
  },
});
