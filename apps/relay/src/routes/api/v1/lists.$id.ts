import { createFileRoute } from "@tanstack/react-router";
import { listPatch } from "../../../console/schemas";
import { apiRoute, data, readJson } from "../../../core/api-route";
import { deleteListForScope, getListForScope, updateListForScope } from "../../../core/lists";

export const Route = createFileRoute("/api/v1/lists/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, params }) => data(await getListForScope(env, scope, params.id))),
      PATCH: apiRoute(async ({ env, scope, params, request }) =>
        data(await updateListForScope(env, scope, params.id, listPatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, scope, params }) => {
        await deleteListForScope(env, scope, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
