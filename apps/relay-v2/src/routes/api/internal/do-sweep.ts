import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { sweepWorkspaces } from "../../../core/do-sweep";
import { guardInternal } from "../../../core/internal-guard";

export const Route = createFileRoute("/api/internal/do-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardInternal(request, env.INTERNAL_SECRET);
        if (denied) return denied;
        return Response.json(await sweepWorkspaces(env));
      },
    },
  },
});
