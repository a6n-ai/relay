import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer } from "../../../core/api-keys";
import { getMessageForScope } from "../../../core/messages";

export const Route = createFileRoute("/api/v1/messages/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        const view = await getMessageForScope(env, scope, params.id);
        if (!view) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(view);
      },
    },
  },
});
