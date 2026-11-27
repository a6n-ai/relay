import { createFileRoute } from "@tanstack/react-router";
import { decodeCursor } from "../../../core/cursor";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { createCampaign, listCampaigns, withConsoleUrl } from "../../../services/campaigns";
import { campaignCreateInput } from "../../../services/schemas";

export const Route = createFileRoute("/api/v1/campaigns")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listCampaigns(env, p, p.appId, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, request }) =>
        data(withConsoleUrl(env, await createCampaign(env, p, p.appId, campaignCreateInput.parse(await readJson(request)))), 201),
      ),
    },
  },
});
