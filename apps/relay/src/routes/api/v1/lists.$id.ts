import { createFileRoute } from "@tanstack/react-router";
import { listPatch } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { deleteList, getList, updateList } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params }) => data(await getList(env, p, params.id))),
      PATCH: apiRoute(async ({ env, p, params, request }) =>
        data(await updateList(env, p, params.id, listPatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, p, params }) => {
        await deleteList(env, p, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
