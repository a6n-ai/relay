import { createFileRoute } from "@tanstack/react-router";
import { deleteAudienceHook, getAudienceHook, setAudienceHook } from "../../../services/audience-hook";
import { apiRoute, data, json, readJson } from "../../../api/route";

// The secret is returned once, by PUT. GET never carries it.
export const Route = createFileRoute("/api/v1/audience-hook")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p }) => {
        const hook = await getAudienceHook(env, p, p.appId);
        return hook ? data(hook) : json({ error: "not found" }, 404);
      }),
      PUT: apiRoute(async ({ env, p, request }) => data(await setAudienceHook(env, p, p.appId, await readJson(request)))),
      DELETE: apiRoute(async ({ env, p }) => {
        await deleteAudienceHook(env, p, p.appId);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
