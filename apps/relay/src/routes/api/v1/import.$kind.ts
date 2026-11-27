import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, json, readJson } from "../../../core/api-route";
import {
  importCampaignsForScope,
  importCampaignsBody,
  importListsForScope,
  importListsBody,
  importMessagesForScope,
  importMessagesBody,
  importSuppressionsForScope,
  importSuppressionsBody,
  importTemplatesForScope,
  importTemplatesBody,
} from "../../../core/imports";

export const Route = createFileRoute("/api/v1/import/$kind")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, params, request }) => {
        const body = await readJson(request);
        switch (params.kind) {
          case "lists":
            return data(await importListsForScope(env, scope, importListsBody.parse(body).rows));
          case "templates":
            return data(await importTemplatesForScope(env, scope, importTemplatesBody.parse(body).rows));
          case "campaigns":
            return data(await importCampaignsForScope(env, scope, importCampaignsBody.parse(body).rows));
          case "messages":
            return data(await importMessagesForScope(env, scope, importMessagesBody.parse(body).rows));
          case "suppressions":
            return data(await importSuppressionsForScope(env, scope, importSuppressionsBody.parse(body).rows));
          default:
            return json({ error: "not found" }, 404);
        }
      }),
    },
  },
});
