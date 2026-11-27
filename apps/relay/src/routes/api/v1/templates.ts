import { createFileRoute } from "@tanstack/react-router";
import { templateInput } from "../../../services/schemas";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { createTemplate, listTemplates } from "../../../services/templates";
import { decodeCursor } from "../../../core/cursor";

export const Route = createFileRoute("/api/v1/templates")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, p, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listTemplates(env, p, scope.appId, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, scope, p, request }) =>
        data(await createTemplate(env, p, scope.appId, templateInput.parse(await readJson(request))), 201),
      ),
    },
  },
});
