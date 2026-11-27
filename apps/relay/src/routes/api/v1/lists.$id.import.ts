import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, readJson } from "../../../api/route";
import { importMembersForScope, membersImportInput } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id/import")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, params, request }) => {
        const { rows } = membersImportInput.parse(await readJson(request));
        return data(await importMembersForScope(env, scope, params.id, rows));
      }),
    },
  },
});
