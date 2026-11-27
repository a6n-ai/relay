import { createFileRoute } from "@tanstack/react-router";
import { campaignPatch } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { deleteCampaignForScope, getCampaignForScope, updateCampaignForScope } from "../../../services/campaign-scope";

export const Route = createFileRoute("/api/v1/campaigns/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, params }) => data(await getCampaignForScope(env, scope, params.id))),
      PATCH: apiRoute(async ({ env, scope, params, request }) =>
        data(await updateCampaignForScope(env, scope, params.id, campaignPatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, scope, params }) => {
        await deleteCampaignForScope(env, scope, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
