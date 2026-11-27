import { createFileRoute } from "@tanstack/react-router";
import { templateInput } from "../../../services/schemas";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { createTemplate, listTemplates } from "../../../services/templates";
import { decodeCursor } from "../../../core/cursor";

export const Route = createFileRoute("/api/v1/templates")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listTemplates(env, p, p.appId, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, request }) =>
        data(await createTemplate(env, p, p.appId, templateInput.parse(await readJson(request))), 201),
      ),
    },
  },
});
