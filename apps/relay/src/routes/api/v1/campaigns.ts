import { createFileRoute } from "@tanstack/react-router";
import { decodeCursor } from "../../../core/cursor";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { campaignCreateInput, createCampaign, listCampaigns, withConsoleUrl } from "../../../services/campaigns";

export const Route = createFileRoute("/api/v1/campaigns")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, p, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listCampaigns(env, p, scope.appId, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, scope, p, request }) =>
        data(withConsoleUrl(env, await createCampaign(env, p, scope.appId, campaignCreateInput.parse(await readJson(request)))), 201),
      ),
    },
  },
});
