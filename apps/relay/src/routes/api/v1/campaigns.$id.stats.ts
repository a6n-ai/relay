import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data } from "../../../core/api-route";
import { campaignStatsForScope } from "../../../core/campaign-scope";

export const Route = createFileRoute("/api/v1/campaigns/$id/stats")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, params }) => data(await campaignStatsForScope(env, scope, params.id))),
    },
  },
});
