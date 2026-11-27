import { createFileRoute } from "@tanstack/react-router";
import { templatePatch } from "../../../services/schemas";
import { apiRoute, data, readJson } from "../../../api/route";
import { deleteTemplate, getTemplate, updateTemplate } from "../../../services/templates";

export const Route = createFileRoute("/api/v1/templates/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params }) => data(await getTemplate(env, p, params.id))),
      PATCH: apiRoute(async ({ env, p, params, request }) =>
        data(await updateTemplate(env, p, params.id, templatePatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, p, params }) => {
        await deleteTemplate(env, p, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
