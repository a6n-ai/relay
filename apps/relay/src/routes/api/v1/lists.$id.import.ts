import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, readJson } from "../../../api/route";
import { importMembers } from "../../../services/lists";
import { membersImportInput } from "../../../services/schemas";

export const Route = createFileRoute("/api/v1/lists/$id/import")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, p, params, request }) => {
        const { rows } = membersImportInput.parse(await readJson(request));
        return data(await importMembers(env, p, params.id, rows));
      }),
    },
  },
});
