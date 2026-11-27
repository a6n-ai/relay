import { createFileRoute } from "@tanstack/react-router";
import { listInput } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { createListForScope, listListsForScope } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope }) => data(await listListsForScope(env, scope))),
      POST: apiRoute(async ({ env, scope, request }) => data(await createListForScope(env, scope, listInput.parse(await readJson(request))), 201)),
    },
  },
});
