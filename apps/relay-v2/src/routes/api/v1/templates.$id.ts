import { createFileRoute } from "@tanstack/react-router";
import { templatePatch } from "../../../console/schemas";
import { apiRoute, data, readJson } from "../../../core/api-route";
import { deleteTemplateForScope, getTemplateForScope, updateTemplateForScope } from "../../../core/templates";

export const Route = createFileRoute("/api/v1/templates/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, params }) => data(await getTemplateForScope(env, scope, params.id))),
      PATCH: apiRoute(async ({ env, scope, params, request }) =>
        data(await updateTemplateForScope(env, scope, params.id, templatePatch.parse(await readJson(request)))),
      ),
      DELETE: apiRoute(async ({ env, scope, params }) => {
        await deleteTemplateForScope(env, scope, params.id);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
