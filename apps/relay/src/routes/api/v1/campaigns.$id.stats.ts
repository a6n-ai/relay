import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data } from "../../../api/route";
import { campaignStats } from "../../../services/campaigns";

export const Route = createFileRoute("/api/v1/campaigns/$id/stats")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params }) => data(await campaignStats(env, p, params.id))),
    },
  },
});
