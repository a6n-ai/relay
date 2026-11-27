import { createFileRoute } from "@tanstack/react-router";
import { deleteAudienceHookForScope, getAudienceHookForScope, setAudienceHookForScope } from "../../../services/audience-hook";
import { apiRoute, data, json, readJson } from "../../../api/route";

// The secret is returned once, by PUT. GET never carries it.
export const Route = createFileRoute("/api/v1/audience-hook")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope }) => {
        const hook = await getAudienceHookForScope(env, scope);
        return hook ? data(hook) : json({ error: "not found" }, 404);
      }),
      PUT: apiRoute(async ({ env, scope, request }) => data(await setAudienceHookForScope(env, scope, await readJson(request)))),
      DELETE: apiRoute(async ({ env, scope }) => {
        await deleteAudienceHookForScope(env, scope);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
