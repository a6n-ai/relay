import { createFileRoute } from "@tanstack/react-router";
import { listInput } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { createList, listLists } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p }) => data(await listLists(env, p, p.appId))),
      POST: apiRoute(async ({ env, p, request }) => data(await createList(env, p, p.appId, listInput.parse(await readJson(request))), 201)),
    },
  },
});
