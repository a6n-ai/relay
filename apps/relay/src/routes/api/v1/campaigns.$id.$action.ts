import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiRoute, data, json, readJson } from "../../../api/route";
import {
  cancelCampaignForScope,
  pauseCampaignForScope,
  resumeCampaignForScope,
  scheduleCampaignForScope,
} from "../../../services/campaign-scope";

export const scheduleBody = z.object({ at: z.number().int() });

export const Route = createFileRoute("/api/v1/campaigns/$id/$action")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, params, request }) => {
        switch (params.action) {
          case "schedule":
            return data(await scheduleCampaignForScope(env, scope, params.id, scheduleBody.parse(await readJson(request)).at));
          case "pause":
            await pauseCampaignForScope(env, scope, params.id);
            return new Response(null, { status: 204 });
          case "resume":
            return data(await resumeCampaignForScope(env, scope, params.id));
          case "cancel":
            return data(await cancelCampaignForScope(env, scope, params.id));
          default:
            return json({ error: "not found" }, 404);
        }
      }),
    },
  },
});
