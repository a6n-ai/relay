import { createFileRoute } from "@tanstack/react-router";
import { decodeCursor } from "../../../core/cursor";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { campaignCreateInput, createCampaignForScope, listCampaignsForScope } from "../../../services/campaign-scope";

export const Route = createFileRoute("/api/v1/campaigns")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listCampaignsForScope(env, scope, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, scope, request }) =>
        data(await createCampaignForScope(env, scope, campaignCreateInput.parse(await readJson(request))), 201),
      ),
    },
  },
});
