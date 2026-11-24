import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { ConsoleError, requireActor } from "../../../console/actor";
import { messageFileFor } from "../../../console/messages";

export const Route = createFileRoute("/api/console/messages/$id/$part")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(env, request.headers);
          const view = new URL(request.url).searchParams.get("view") === "1";
          return await messageFileFor(env, actor, params.id, params.part, view);
        } catch (err) {
          if (err instanceof ConsoleError) return Response.json({ error: err.message }, { status: err.status });
          console.error("console download failed", params.id, err instanceof Error ? err.name : "unknown");
          return Response.json({ error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
