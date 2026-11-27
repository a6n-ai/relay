import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { guardInternal } from "../../../core/internal-guard";
import { sweepAll } from "../../../jobs/sweep-all";

export const Route = createFileRoute("/api/internal/do-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardInternal(request, env.INTERNAL_SECRET);
        if (denied) return denied;
        return Response.json(await sweepAll(env));
      },
    },
  },
});
