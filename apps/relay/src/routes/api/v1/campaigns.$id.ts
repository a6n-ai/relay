import { createFileRoute } from "@tanstack/react-router";
import { campaignPatch } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { deleteCampaign, getCampaign, updateCampaign } from "../../../services/campaigns";

export const Route = createFileRoute("/api/v1/campaigns/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params }) => data(await getCampaign(env, p, params.id))),
      PATCH: apiRoute(async ({ env, p, params, request }) =>
        data(await updateCampaign(env, p, params.id, campaignPatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, p, params }) => {
        await deleteCampaign(env, p, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
