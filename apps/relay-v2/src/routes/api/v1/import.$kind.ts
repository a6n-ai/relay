import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiRoute, data, json, readJson } from "../../../core/api-route";
import {
  importCampaignsForScope,
  importCampaignsSchema,
  importListsForScope,
  importListsSchema,
  importSuppressionsForScope,
  importSuppressionsSchema,
  importTemplatesForScope,
  importTemplatesSchema,
} from "../../../core/imports";

export const Route = createFileRoute("/api/v1/import/$kind")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, params, request }) => {
        const body = await readJson(request);
        switch (params.kind) {
          case "lists":
            return data(await importListsForScope(env, scope, z.object({ rows: importListsSchema }).parse(body).rows));
          case "templates":
            return data(await importTemplatesForScope(env, scope, z.object({ rows: importTemplatesSchema }).parse(body).rows));
          case "campaigns":
            return data(await importCampaignsForScope(env, scope, z.object({ rows: importCampaignsSchema }).parse(body).rows));
          case "suppressions":
            return data(await importSuppressionsForScope(env, scope, z.object({ rows: importSuppressionsSchema }).parse(body).rows));
          default:
            return json({ error: "not found" }, 404);
        }
      }),
    },
  },
});
