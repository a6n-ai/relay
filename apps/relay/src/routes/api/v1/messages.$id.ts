import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../services/api-keys";
import { getMessage } from "../../../services/messages";

export const Route = createFileRoute("/api/v1/messages/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const p = await resolveBearer(env, request);
        if (!p) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, p.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        const view = await getMessage(env, p, params.id);
        if (!view) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(view);
      },
    },
  },
});
