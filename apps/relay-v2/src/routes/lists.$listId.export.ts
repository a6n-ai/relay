import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { ConsoleError, requireActor } from "../console/actor";
import { exportMembersFor } from "../console/lists";

export const Route = createFileRoute("/lists/$listId/export")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(env, request.headers);
          if (params.listId.length > 64) throw new ConsoleError(404, "not found");
          return await exportMembersFor(env, actor, params.listId);
        } catch (err) {
          if (err instanceof ConsoleError) return Response.json({ error: err.message }, { status: err.status });
          console.error("console export failed", err instanceof Error ? err.name : "unknown");
          return Response.json({ error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
