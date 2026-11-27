import { createFileRoute } from "@tanstack/react-router";
import { cursorParam, templateInput } from "../../../services/schemas";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { createTemplate, listTemplates } from "../../../services/templates";

export const Route = createFileRoute("/api/v1/templates")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, request }) => {
        const page = await listTemplates(env, p, p.appId, cursorParam(request));
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, request }) =>
        data(await createTemplate(env, p, p.appId, templateInput.parse(await readJson(request))), 201),
      ),
    },
  },
});
