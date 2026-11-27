import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { requireActor } from "../console/actor";
import { exportMembers } from "../services/lists";
import { describeError } from "../core/log";
import { RelayError } from "../shared/errors";

export const Route = createFileRoute("/lists/$listId/export")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const p = await requireActor(env, request.headers, { permission: { list: ["import"] } });
          if (p.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
          if (params.listId.length > 64) throw new RelayError("not found");
          return await exportMembers(env, p, params.listId);
        } catch (err) {
          if (err instanceof RelayError) return Response.json({ error: err.message }, { status: err.status });
          console.error("console export failed", describeError(err));
          return Response.json({ error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
