import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { createCampaign, listCampaigns } from "../../../services/campaigns";
import { campaignCreateInput, cursorParam } from "../../../services/schemas";

export const Route = createFileRoute("/api/v1/campaigns")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, request }) => {
        const page = await listCampaigns(env, p, p.appId, cursorParam(request));
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, request }) =>
        data(await createCampaign(env, p, p.appId, campaignCreateInput.parse(await readJson(request))), 201),
      ),
    },
  },
});
