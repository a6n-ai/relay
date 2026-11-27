import { createFileRoute } from "@tanstack/react-router";
import { listInput } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { createList, listLists } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, p }) => data(await listLists(env, p, scope.appId))),
      POST: apiRoute(async ({ env, scope, p, request }) => data(await createList(env, p, scope.appId, listInput.parse(await readJson(request))), 201)),
    },
  },
});
