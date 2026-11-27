import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { requireActor } from "../../../console/actor";
import { messageFile } from "../../../services/inbox";
import { describeError } from "../../../core/log";
import { RelayError, statusOf } from "../../../shared/errors";

export const Route = createFileRoute("/api/console/messages/$id/$part")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const p = await requireActor(env, request.headers);
          if (params.id.length > 64 || params.part.length > 64) throw new RelayError("not found");
          const view = new URL(request.url).searchParams.get("view") === "1";
          return await messageFile(env, p, params.id, params.part, view);
        } catch (err) {
          const status = statusOf(err);
          if (status) return Response.json({ error: (err as Error).message }, { status });
          console.error("console download failed", params.id, describeError(err));
          return Response.json({ error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
